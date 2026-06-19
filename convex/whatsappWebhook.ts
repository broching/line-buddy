import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { decryptSecret } from "./lib/crypto";
import { verifyWasenderSignature, decryptMedia, isGroupJid, getGroupMetadata, getGroupPicture } from "./lib/wasenderApi";
import { sendGroupMessage, type SendCreds } from "./lib/messaging";

const WEBHOOK_PREFIX = "/webhooks/whatsapp/";
const MANAGED_PATH = "/webhooks/whatsapp-managed";

const HELP_TEXT = `📋 Lead Mighty Commands

/new-project NAME — Create a new project in this group
/projects — List active projects in this group
/status — Show current stage and missing fields
/connect TOKEN — Link this group to your organization
/help — Show this message`;

const WELCOME_TEXT = `👋 Hi! I'm Lead Mighty.

Type /connect TOKEN to link this group to your organization, or /help to see all commands.`;

// ─── Entry point ──────────────────────────────────────────────────────────────

export const handleWhatsappWebhook = httpAction(async (ctx, request) => {
  const pathname = new URL(request.url).pathname;
  const body = await request.text();

  // Always ack quickly; never leak which tokens are valid.
  const ok = () =>
    new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  let env: Env;

  if (pathname === MANAGED_PATH) {
    // Shared LeadMighty bot — one session for all orgs, creds in env, org resolved
    // per group (like the LINE shared bot).
    const secret = process.env.WASENDER_MANAGED_WEBHOOK_SECRET?.trim();
    if (secret && !verifyWasenderSignature(request.headers.get("x-webhook-signature"), secret)) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
    }
    env = {
      managed: true,
      apiKey: process.env.WASENDER_MANAGED_API_KEY?.trim() ?? "",
      botPhone: process.env.WASENDER_MANAGED_PHONE?.trim(),
    };
  } else {
    // Bring-your-own-number — per-org session resolved from the route token.
    const routeToken = pathname.startsWith(WEBHOOK_PREFIX) ? pathname.slice(WEBHOOK_PREFIX.length) : "";
    if (!routeToken) return ok();

    const session = await ctx.runQuery(internal.whatsappSessions.getByRouteToken, { routeToken });
    if (!session) return ok();

    let webhookSecret = "";
    try {
      if (session.webhookSecret) webhookSecret = await decryptSecret(session.webhookSecret);
    } catch { /* treat as no secret */ }
    if (webhookSecret && !verifyWasenderSignature(request.headers.get("x-webhook-signature"), webhookSecret)) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
    }

    let apiKey = "";
    try {
      apiKey = await decryptSecret(session.apiKey);
    } catch { /* sending will be skipped if empty */ }

    env = {
      managed: false,
      organizationId: session.organizationId as Id<"organizations">,
      sessionRowId: session._id as Id<"whatsappSessions">,
      apiKey,
      botPhone: session.phoneNumber ?? undefined,
    };
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return ok();
  }

  try {
    await processEvent(ctx, payload, env);
  } catch (err) {
    console.error(`[WhatsApp webhook] event=${payload?.event} error:`, err);
  }

  return ok();
});

type Env = {
  managed: boolean;
  organizationId?: Id<"organizations">;
  sessionRowId?: Id<"whatsappSessions">;
  apiKey: string;
  botPhone?: string; // the bot's own number, to detect "bot was just added"
};

async function processEvent(ctx: any, payload: any, env: Env) {
  switch (payload.event) {
    case "messages.received":
    case "messages-group.received":
    case "messages.upsert":
      await handleIncomingMessage(ctx, payload, env);
      break;
    case "groups.upsert":
      await handleGroupsUpsert(ctx, payload, env);
      break;
    case "group-participants.update":
      await handleParticipantsUpdate(ctx, payload, env);
      break;
    case "session.status":
      await handleSessionStatus(ctx, payload, env);
      break;
    default:
      break;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function creds(env: Env): SendCreds {
  return { channel: "whatsapp", apiKey: env.apiKey };
}

// Send a bot message to the group and (if the group is connected) store it in the feed.
async function botSend(
  ctx: any,
  env: Env,
  groupJid: string,
  text: string,
  store?: { organizationId: Id<"organizations">; groupChatId: Id<"groupChats"> }
) {
  if (env.apiKey) await sendGroupMessage(creds(env), groupJid, { text });
  if (store) {
    await ctx.runMutation(api.messages.storeBotPush, {
      organizationId: store.organizationId,
      groupChatId: store.groupChatId,
      text,
      timestamp: Date.now(),
    });
  }
}

// Posts the join welcome once per group (while still unconnected). Claims atomically,
// releases the claim if the send fails so it can retry on the next event.
async function maybeWelcome(ctx: any, env: Env, jid: string) {
  if (!env.apiKey) {
    console.warn("[WhatsApp webhook] welcome skipped — no apiKey (set WASENDER_MANAGED_API_KEY in Convex)");
    return;
  }
  const claimed = await ctx.runMutation(internal.whatsappSessions.recordWelcomeIfNew, {
    providerGroupId: jid,
  });
  if (!claimed) return;
  const ok = await sendGroupMessage(creds(env), jid, { text: WELCOME_TEXT });
  if (!ok) {
    await ctx.runMutation(internal.whatsappSessions.releaseWelcome, { providerGroupId: jid });
  }
}

function senderPhone(key: any): string {
  const raw =
    key?.cleanedParticipantPn ??
    key?.participantPn ??
    key?.participant ??
    key?.cleanedSenderPn ??
    key?.senderPn ??
    "unknown";
  return String(raw).split("@")[0];
}

const MEDIA_TYPES = ["imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage"] as const;

function detectMedia(message: any): { type: "image" | "video" | "audio" | "file" | "sticker"; label: string } | null {
  if (!message) return null;
  if (message.imageMessage) return { type: "image", label: "[Image]" };
  if (message.videoMessage) return { type: "video", label: "[Video]" };
  if (message.audioMessage) return { type: "audio", label: "[Audio]" };
  if (message.stickerMessage) return { type: "sticker", label: "[Sticker]" };
  if (message.documentMessage) return { type: "file", label: "[File attachment]" };
  return null;
}

// ─── Incoming message ───────────────────────────────────────────────────────

async function handleIncomingMessage(ctx: any, payload: any, env: Env) {
  const data = payload.data ?? {};
  const msg = Array.isArray(data.messages) ? data.messages[0] : data.messages;
  if (!msg) return;

  const key = msg.key ?? {};
  if (key.fromMe) return; // ignore our own outbound messages

  const groupJid: string | undefined = key.remoteJid;
  if (!groupJid || !isGroupJid(groupJid)) return; // groups only

  const messageId: string = String(key.id ?? `${groupJid}_${Date.now()}`);
  const userId = senderPhone(key);
  const senderName: string | undefined =
    (typeof msg.pushName === "string" && msg.pushName.trim()) ? msg.pushName.trim() : undefined;
  const text: string = (msg.messageBody ?? msg.message?.conversation ?? "").trim();
  const media = detectMedia(msg.message);

  // Dedup actionable messages: Wasender re-delivers the same message under several
  // events (messages.received + messages-group.received + messages.upsert). We only
  // claim once there's real content, so an empty/protocol event can't "use up" the id.
  if (key.id && (text || media)) {
    const fresh = await ctx.runMutation(internal.whatsappSessions.claimInboundKey, { keyId: messageId });
    if (!fresh) return;
  }

  // ── /connect TOKEN — works before the group is registered ──
  if (text.startsWith("/connect")) {
    await handleConnect(ctx, env, groupJid, messageId, userId, text);
    return;
  }

  const group = await ctx.runQuery(api.groupChats.getByLineGroupId, { lineGroupId: groupJid });

  // Fallback welcome: first activity in a group the bot is in but isn't connected yet
  // (covers cases where groups.upsert wasn't delivered). Dedup keeps it to once.
  if (!group) await maybeWelcome(ctx, env, groupJid);

  // ── Media message ──
  if (media) {
    if (!group || !group.isActive) return;
    await handleMedia(ctx, env, payload, group, key, userId, media);
    return;
  }

  // ── Normal (non-command) text — store + let AI run if active projects exist ──
  if (text && !text.startsWith("/")) {
    if (!group || !group.isActive) return;
    const activeProjects = await ctx.runQuery(api.projects.getActiveByGroup, { lineGroupId: groupJid });
    const hasActiveProjects = Array.isArray(activeProjects) && activeProjects.length > 0;

    // Both managed and BYO groups stay visible, but only the org's selected mode is
    // processed by the AI. Off-mode messages are stored for history only.
    const orgMode = await ctx.runQuery(internal.organizations.getWhatsappModeInternal, {
      organizationId: group.organizationId,
    });
    const isActiveMode = orgMode === (env.managed ? "managed" : "byo");

    await ctx.runMutation(api.messages.storeFromWebhook, {
      organizationId: group.organizationId,
      groupChatId: group._id,
      channel: "whatsapp",
      lineMessageId: messageId,
      lineUserId: userId,
      text,
      messageType: "text",
      timestamp: Date.now(),
      skipAI: !hasActiveProjects || !isActiveMode,
    });

    // Track the sender; use their WhatsApp display name (pushName) when available.
    await ctx.runMutation(api.userLineProfiles.upsertFromWebhook, {
      organizationId: group.organizationId,
      channel: "whatsapp",
      lineUserId: userId,
      displayName: senderName ?? userId,
    });
    return;
  }

  // Nothing actionable (e.g. an empty/unsupported payload) — don't store noise.
  if (!text) return;

  // ── Slash commands ──
  if (text === "/help") {
    await botSend(
      ctx,
      env,
      groupJid,
      HELP_TEXT,
      group?.isActive ? { organizationId: group.organizationId, groupChatId: group._id } : undefined
    );
    return;
  }

  if (!group || !group.isActive) {
    if (text.startsWith("/")) {
      await botSend(ctx, env, groupJid, "This group is not connected to Lead Mighty. Type /connect TOKEN to link it.");
    }
    return;
  }

  // Store the command message (skipAI)
  await ctx.runMutation(api.messages.storeFromWebhook, {
    organizationId: group.organizationId,
    groupChatId: group._id,
    channel: "whatsapp",
    lineMessageId: messageId,
    lineUserId: userId,
    text,
    messageType: "text",
    timestamp: Date.now(),
    skipAI: true,
  });

  if (text.startsWith("/new-project")) {
    await handleNewProject(ctx, env, group, groupJid, text);
    return;
  }
  if (text === "/projects") {
    await handleListProjects(ctx, env, group, groupJid);
    return;
  }
  if (text === "/status") {
    await handleStatus(ctx, env, group, groupJid);
    return;
  }
}

// ─── /connect ─────────────────────────────────────────────────────────────────

async function handleConnect(ctx: any, env: Env, groupJid: string, messageId: string, userId: string, text: string) {
  const token = text.split(/\s+/)[1]?.toUpperCase();
  if (!token) {
    await botSend(ctx, env, groupJid, "Usage: /connect TOKEN\n\nGenerate a token from your dashboard → Settings → WhatsApp.");
    return;
  }
  try {
    const { orgName, organizationId } = await ctx.runMutation(api.connectTokens.consume, { token });

    // Pull the real group name + icon from WhatsApp so the dashboard isn't just "WhatsApp Group".
    let displayName = "WhatsApp Group";
    let pictureUrl: string | undefined;
    if (env.apiKey) {
      try {
        const meta = await getGroupMetadata(env.apiKey, groupJid);
        if (meta?.subject) displayName = meta.subject;
        const pic = await getGroupPicture(env.apiKey, groupJid);
        if (pic) pictureUrl = pic;
      } catch { /* best-effort */ }
    }

    const groupChatId: Id<"groupChats"> = await ctx.runMutation(api.groupChats.connect, {
      organizationId,
      lineGroupId: groupJid,
      displayName,
      pictureUrl,
      channel: "whatsapp",
      whatsappAgent: env.managed ? "managed" : "byo",
      whatsappSessionId: env.sessionRowId,
    });
    const replyText = `✅ Connected to ${orgName}!\n\nCreate a project with /new-project NAME. Type /help for all commands.`;
    await botSend(ctx, env, groupJid, replyText, { organizationId, groupChatId });
    // Store the /connect command message
    await ctx.runMutation(api.messages.storeFromWebhook, {
      organizationId,
      groupChatId,
      channel: "whatsapp",
      lineMessageId: messageId,
      lineUserId: userId,
      text,
      messageType: "text",
      timestamp: Date.now(),
      skipAI: true,
    });
  } catch (err: unknown) {
    await botSend(ctx, env, groupJid, `❌ Connection failed: ${err instanceof Error ? err.message : "Unknown error"}`);
  }
}

// ─── /new-project ───────────────────────────────────────────────────────────

async function handleNewProject(ctx: any, env: Env, group: any, groupJid: string, text: string) {
  const projectName = text.replace(/^\/new-project\s*/i, "").trim();
  if (!projectName) {
    await botSend(ctx, env, groupJid, "Usage: /new-project PROJECT NAME", { organizationId: group.organizationId, groupChatId: group._id });
    return;
  }

  const templates = (await ctx.runQuery(api.workflowTemplates.list, {
    organizationId: group.organizationId,
  })) as Array<{ _id: string; name: string }>;

  if (templates.length === 0) {
    await botSend(ctx, env, groupJid, "No workflow templates found. Create one in the dashboard first.", { organizationId: group.organizationId, groupChatId: group._id });
    return;
  }

  try {
    const result = await ctx.runMutation(api.projects.createFromBot, {
      organizationId: group.organizationId,
      groupChatId: group._id,
      workflowTemplateId: templates[0]._id as Id<"workflowTemplates">,
      name: projectName,
    });

    let reply = `✅ Project created: *${result.projectName}*\n\n`;
    if (result.firstStage) {
      reply += `📋 Stage 1: ${result.firstStage.name}\n`;
      if (result.firstStage.description) reply += `${result.firstStage.description}\n`;
      reply += "\n";
      const required = result.firstStage.requiredFields.filter((f: any) => f.isRequired);
      if (required.length > 0) {
        reply += `Required info:\n${required.map((f: any) => `• ${f.label}`).join("\n")}`;
      }
      if (result.firstStage.responsibleRole) {
        reply += `\n\nResponsible: @${result.firstStage.responsibleRole}`;
      }
    }
    await botSend(ctx, env, groupJid, reply, { organizationId: group.organizationId, groupChatId: group._id });
  } catch (err: unknown) {
    await botSend(ctx, env, groupJid, `❌ Failed to create project: ${err instanceof Error ? err.message : "Unknown error"}`, { organizationId: group.organizationId, groupChatId: group._id });
  }
}

// ─── /projects ────────────────────────────────────────────────────────────────

async function handleListProjects(ctx: any, env: Env, group: any, groupJid: string) {
  const projects = (await ctx.runQuery(api.projects.getActiveByGroup, { lineGroupId: groupJid })) as
    | Array<{ name: string; currentStageOrder: number }>
    | null;

  if (!projects || projects.length === 0) {
    await botSend(ctx, env, groupJid, "No active projects in this group.\n\nCreate one with /new-project NAME", { organizationId: group.organizationId, groupChatId: group._id });
    return;
  }
  const list = projects.map((p, i) => `${i + 1}. ${p.name} (Stage ${p.currentStageOrder})`).join("\n");
  await botSend(ctx, env, groupJid, `📁 Active projects:\n\n${list}`, { organizationId: group.organizationId, groupChatId: group._id });
}

// ─── /status ──────────────────────────────────────────────────────────────────

async function handleStatus(ctx: any, env: Env, group: any, groupJid: string) {
  const projects = (await ctx.runQuery(api.projects.getActiveByGroup, { lineGroupId: groupJid })) as
    | Array<{ _id: string; name: string; currentStageOrder: number }>
    | null;

  if (!projects || projects.length === 0) {
    await botSend(ctx, env, groupJid, "No active projects. Create one with /new-project NAME", { organizationId: group.organizationId, groupChatId: group._id });
    return;
  }

  const statusLines: string[] = [];
  for (const project of projects) {
    const stageStates = (await ctx.runQuery(api.projectStageStates.listByProject, {
      projectId: project._id as Id<"projects">,
      organizationId: group.organizationId,
    })) as Array<{ status: string; stageOrder: number; stageTemplateId: string; collectedFields: any }>;

    const activeState = stageStates.find((s) => s.status === "active");
    if (!activeState) continue;

    const stageTemplate = (await ctx.runQuery(api.workflowStageTemplates.getById, {
      stageId: activeState.stageTemplateId as Id<"workflowStageTemplates">,
      organizationId: group.organizationId,
    })) as { name: string; requiredFields: Array<{ key: string; label: string; isRequired: boolean }> } | null;
    if (!stageTemplate) continue;

    const collectedKeys = Object.keys(activeState.collectedFields ?? {});
    const missingFields = stageTemplate.requiredFields
      .filter((f) => f.isRequired && !collectedKeys.includes(f.key))
      .map((f) => `• ${f.label}`);

    let line = `📌 ${project.name}\n`;
    line += `   Stage ${activeState.stageOrder}: ${stageTemplate.name}\n`;
    line += missingFields.length > 0
      ? `   Missing:\n${missingFields.map((f) => `   ${f}`).join("\n")}`
      : `   ✅ All info collected`;
    statusLines.push(line);
  }

  await botSend(ctx, env, groupJid, statusLines.length ? statusLines.join("\n\n") : "No active stages found.", { organizationId: group.organizationId, groupChatId: group._id });
}

// ─── Media ────────────────────────────────────────────────────────────────────

async function handleMedia(ctx: any, env: Env, payload: any, group: any, key: any, userId: string, media: { type: string; label: string }) {
  const messageId: string = String(key.id ?? `${group.lineGroupId}_${Date.now()}`);
  let storageId: Id<"_storage"> | undefined;

  // Decrypt → temporary public URL → download → store in Convex.
  if (env.apiKey) {
    const publicUrl = await decryptMedia(env.apiKey, payload.data);
    if (publicUrl) {
      try {
        const mediaRes = await fetch(publicUrl);
        if (mediaRes.ok) {
          const bytes = new Uint8Array(await mediaRes.arrayBuffer());
          const contentType = mediaRes.headers.get("content-type") ?? "application/octet-stream";
          const uploadUrl = await ctx.runMutation(api.messages.generateMediaUploadUrl, {});
          const uploadRes = await fetch(uploadUrl, {
            method: "POST",
            body: bytes,
            headers: { "Content-Type": contentType },
          });
          if (uploadRes.ok) {
            const { storageId: sid } = await uploadRes.json();
            storageId = sid;
            ctx.runMutation(internal.billing.addStorageBytes, {
              organizationId: group.organizationId,
              bytes: bytes.byteLength,
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.error("[WhatsApp webhook] media download/upload failed:", err);
      }
    }
  }

  await ctx.runMutation(api.messages.storeFromWebhook, {
    organizationId: group.organizationId,
    groupChatId: group._id,
    channel: "whatsapp",
    lineMessageId: messageId,
    lineUserId: userId,
    text: media.label,
    storageId,
    messageType: media.type === "sticker" ? "sticker" : (media.type as "image" | "video" | "audio" | "file"),
    timestamp: Date.now(),
    skipAI: true,
  });
}

// ─── groups.upsert ──────────────────────────────────────────────────────────

async function handleGroupsUpsert(ctx: any, payload: any, env: Env) {
  const groups = Array.isArray(payload.data) ? payload.data : [payload.data];
  for (const g of groups) {
    if (!g?.jid) continue;

    // Welcome only for genuinely NEW groups (groups.upsert is also re-emitted for
    // existing groups on reconnect). New ⇒ the bot created/owns it, or it was just
    // created. `creation` is unix seconds when present (sometimes absent).
    const botPhone = (env.botPhone ?? "").replace(/\D/g, "");
    const owner = String(g.owner ?? "").split("@")[0].replace(/\D/g, "");
    const ownedByBot = !!botPhone && !!owner && (owner === botPhone || owner.endsWith(botPhone) || botPhone.endsWith(owner));

    let createdMs = Number(g.creation);
    if (Number.isFinite(createdMs) && createdMs > 0) {
      if (createdMs < 1e12) createdMs *= 1000; // seconds → ms
    } else {
      createdMs = 0;
    }
    const recentlyCreated = createdMs > 0 && Date.now() - createdMs < 10 * 60 * 1000;

    console.log(`[WhatsApp webhook] groups.upsert jid=${g.jid} owner=${owner} ownedByBot=${ownedByBot} recentlyCreated=${recentlyCreated}`);
    if (ownedByBot || recentlyCreated) await maybeWelcome(ctx, env, g.jid);

    const group = await ctx.runQuery(api.groupChats.getByLineGroupId, { lineGroupId: g.jid });
    if (!group) continue;
    // BYO: only touch groups owned by this session's org. Managed: any connected group.
    if (!env.managed && env.organizationId && group.organizationId !== env.organizationId) continue;

    // Backfill the group icon for groups connected before we fetched it.
    let pictureUrl: string | undefined;
    if (env.apiKey && !group.pictureUrl) {
      try {
        pictureUrl = (await getGroupPicture(env.apiKey, g.jid)) ?? undefined;
      } catch { /* best-effort */ }
    }

    await ctx.runMutation(internal.groupChats.updateMetaInternal, {
      groupChatId: group._id,
      displayName: typeof g.subject === "string" ? g.subject : undefined,
      pictureUrl,
      memberCount: Array.isArray(g.participants) ? g.participants.length : undefined,
    });

    // Seed member profiles (name = phone fallback) for role-mapping dropdowns.
    if (Array.isArray(g.participants)) {
      for (const p of g.participants.slice(0, 100)) {
        const phone = String(p.jid ?? p.id ?? "").split("@")[0];
        if (!phone) continue;
        await ctx.runMutation(api.userLineProfiles.upsertFromWebhook, {
          organizationId: group.organizationId,
          channel: "whatsapp",
          lineUserId: phone,
          displayName: phone,
        });
      }
    }
  }
}

// ─── group-participants.update ────────────────────────────────────────────────

// Welcomes when the bot itself is freshly added to a group (a new relationship),
// without firing for existing groups synced on reconnect.
async function handleParticipantsUpdate(ctx: any, payload: any, env: Env) {
  const d = payload.data ?? {};
  if (d.action !== "add" || !d.jid) return;
  const bot = (env.botPhone ?? "").replace(/\D/g, "");
  if (!bot) return;
  const added = (Array.isArray(d.participants) ? d.participants : []).map((p: any) =>
    String(p).split("@")[0].replace(/\D/g, "")
  );
  const botAdded = added.some((p: string) => p && (p === bot || p.endsWith(bot) || bot.endsWith(p)));
  if (botAdded) await maybeWelcome(ctx, env, d.jid);
}

// ─── session.status ───────────────────────────────────────────────────────────

async function handleSessionStatus(ctx: any, payload: any, env: Env) {
  const raw = String(payload.data?.status ?? "").toLowerCase();

  // Managed (shared) bot: no per-org row. Nudge a reconnect on unintentional drops.
  if (env.managed) {
    if (raw === "disconnected") {
      await ctx.scheduler.runAfter(5000, internal.whatsappSessions.reconnectManaged, {});
    } else if (raw === "logged_out" || raw === "expired") {
      console.error("[WhatsApp webhook] managed session logged out/expired — re-scan it in the Wasender dashboard");
    }
    return;
  }

  if (!env.sessionRowId) return;
  const rawStatus = String(payload.data?.status ?? "");
  // The mutation decides what to do (incl. whether an unintentional drop should
  // trigger an auto-reconnect) and returns a delay if a reconnect should be scheduled.
  const { scheduleReconnectInMs } = await ctx.runMutation(internal.whatsappSessions.handleStatusChange, {
    id: env.sessionRowId,
    rawStatus,
  });
  if (scheduleReconnectInMs != null) {
    await ctx.scheduler.runAfter(scheduleReconnectInMs, internal.whatsappSessions.reconnect, {
      id: env.sessionRowId,
    });
  }
}

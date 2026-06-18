import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { decryptSecret } from "./lib/crypto";
import {
  verifyLineSignature,
  replyMessage,
  getGroupSummary,
  getGroupMemberProfile,
  getMessageContent,
  type LineEvent,
  type LineMessageEvent,
  type LineJoinEvent,
  type LineLeaveEvent,
} from "./lib/lineApi";

type LineAgent = "managed" | "byok";
const BYOK_PREFIX = "/webhooks/line/";

// Store the bot's reply to a slash command in the messages table so it appears in chat.
async function storeBotReply(ctx: any, group: { _id: Id<"groupChats">; organizationId: Id<"organizations"> }, replyToken: string, text: string, timestamp: number) {
  try {
    await ctx.runMutation(api.messages.storeBotCommandReply, {
      organizationId: group.organizationId,
      groupChatId: group._id,
      text,
      timestamp,
      replyToken,
    });
  } catch { /* non-critical */ }
}

const HELP_TEXT = `📋 Line Buddy Commands

/new-project NAME — Create a new project in this group
/projects — List active projects in this group
/status — Show current stage and missing fields
/connect TOKEN — Link this group to your organization
/help — Show this message`;

export const handleLineWebhook = httpAction(async (ctx, request) => {
  const pathname = new URL(request.url).pathname;
  const body = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";

  const ack = () =>
    new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  let accessToken: string | undefined;
  let channelSecret: string | undefined;
  let agent: LineAgent = "managed";

  if (pathname.startsWith(BYOK_PREFIX)) {
    // Bring-your-own LINE channel — resolve the org's encrypted creds by route token.
    const routeToken = pathname.slice(BYOK_PREFIX.length);
    const channel = await ctx.runQuery(internal.lineChannels.getByRouteToken, { routeToken });
    if (!channel?.accessTokenEnc || !channel?.channelSecretEnc) return ack();
    try {
      accessToken = await decryptSecret(channel.accessTokenEnc);
      channelSecret = await decryptSecret(channel.channelSecretEnc);
    } catch {
      return ack();
    }
    agent = "byok";
  } else {
    // Shared managed LINE bot — env creds.
    channelSecret = process.env.LINE_CHANNEL_SECRET?.trim();
    accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
    agent = "managed";
  }

  if (!channelSecret || !accessToken) {
    console.error("[LINE webhook] Missing channel credentials");
    return ack();
  }

  if (!(await verifyLineSignature(body, channelSecret, signature))) {
    console.error("[LINE webhook] Signature mismatch");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let events: LineEvent[];
  try {
    events = JSON.parse(body).events ?? [];
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (const event of events) {
    try {
      await processEvent(ctx, event, accessToken, agent);
    } catch (err) {
      console.error(`[LINE webhook] Event error type=${(event as any).type}:`, err);
    }
  }

  return ack();
});

async function processEvent(ctx: any, event: LineEvent, accessToken: string, agent: LineAgent) {
  const e = event as any;
  switch (e.type) {
    case "join":
      await handleJoin(e as LineJoinEvent, accessToken);
      break;
    case "leave":
      await handleLeave(ctx, e as LineLeaveEvent);
      break;
    case "message": {
      const msg = e as LineMessageEvent;
      if (msg.message.type === "text" && msg.message.text) {
        await handleTextMessage(ctx, msg, accessToken, agent);
      } else if (["image", "file", "video", "audio"].includes(msg.message.type)) {
        await handleMediaMessage(ctx, msg, accessToken);
      } else if (msg.message.type === "sticker") {
        await handleStickerMessage(ctx, msg);
      }
      break;
    }
  }
}

async function handleJoin(event: LineJoinEvent, accessToken: string) {
  if (!event.replyToken) return;
  await replyMessage(
    event.replyToken,
    accessToken,
    `👋 Hi! I'm Line Buddy.\n\nType /connect TOKEN to link this group to your organization, or /help to see all commands.`
  );
}

async function handleLeave(ctx: any, event: LineLeaveEvent) {
  const groupId = event.source.groupId ?? event.source.roomId;
  if (groupId) await ctx.runMutation(api.groupChats.deactivate, { lineGroupId: groupId });
}

async function handleTextMessage(ctx: any, event: LineMessageEvent, accessToken: string, agent: LineAgent) {
  const text = (event.message.text ?? "").trim();
  const groupId = event.source.groupId ?? event.source.roomId;

  // /connect TOKEN — works before group is registered; can't store (no groupChatId yet)
  if (text.startsWith("/connect")) {
    const token = text.split(/\s+/)[1]?.toUpperCase();
    if (!token) {
      await replyMessage(event.replyToken, accessToken, "Usage: /connect TOKEN\n\nGenerate a token from your dashboard → Settings → LINE.");
      return;
    }
    try {
      const { orgName, organizationId } =
        await ctx.runMutation(api.connectTokens.consume, { token });
      if (!groupId) {
        await replyMessage(event.replyToken, accessToken, "❌ /connect only works in group chats.");
        return;
      }
      const summary = await getGroupSummary(groupId, accessToken);
      const groupChatId = await ctx.runMutation(api.groupChats.connect, {
        organizationId,
        lineGroupId: groupId,
        displayName: summary.groupName,
        pictureUrl: summary.pictureUrl,
        channel: "line",
        lineAgent: agent,
      });
      const replyText = `✅ Connected to ${orgName}!\n\nCreate a project with /new-project NAME. Type /help for all commands.`;
      await replyMessage(event.replyToken, accessToken, replyText);
      // Store the /connect command and the bot's reply now that we have a groupChatId
      await ctx.runMutation(api.messages.storeFromWebhook, {
        organizationId,
        groupChatId,
        lineMessageId: event.message.id,
        lineUserId: event.source.userId ?? "unknown",
        text,
        messageType: "text",
        timestamp: event.timestamp,
        skipAI: true,
      });
      await ctx.runMutation(api.messages.storeBotCommandReply, {
        organizationId,
        groupChatId,
        text: replyText,
        timestamp: event.timestamp,
        replyToken: event.replyToken,
      });
      // Proactively fetch all group member profiles so role assignment dropdowns are pre-populated
      ctx.runAction(internal.userLineProfiles.fetchAllGroupMembersInternal, {
        lineGroupId: groupId,
        organizationId,
      }).catch(() => {});
    } catch (err: unknown) {
      await replyMessage(
        event.replyToken,
        accessToken,
        `❌ Connection failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
    return;
  }

  if (!groupId) return;
  const group = await ctx.runQuery(api.groupChats.getByLineGroupId, { lineGroupId: groupId });

  // Non-command messages: store always; run AI only if there are active projects
  if (!text.startsWith("/")) {
    if (!group || !group.isActive) return;

    const activeProjects = await ctx.runQuery(api.projects.getActiveByGroup, { lineGroupId: groupId });
    const hasActiveProjects = Array.isArray(activeProjects) && activeProjects.length > 0;

    // Both managed and BYOK groups stay visible; only the org's selected LINE mode is
    // AI-processed. Off-mode messages are stored for history only.
    const orgLineMode = await ctx.runQuery(internal.organizations.getLineModeInternal, {
      organizationId: group.organizationId,
    });
    const isActiveMode = orgLineMode === agent;

    const storePromise = ctx.runMutation(api.messages.storeFromWebhook, {
      organizationId: group.organizationId,
      groupChatId: group._id,
      lineMessageId: event.message.id,
      lineUserId: event.source.userId ?? "unknown",
      text,
      messageType: "text",
      timestamp: event.timestamp,
      replyToken: event.replyToken || undefined,
      quoteToken: event.message.quoteToken || undefined,
      skipAI: !hasActiveProjects || !isActiveMode,
    });

    const profilePromise = (async () => {
      const userId = event.source.userId;
      if (!userId || !groupId) return;
      const profile = await getGroupMemberProfile(groupId, userId, accessToken);
      if (!profile?.displayName) return;
      await ctx.runMutation(api.userLineProfiles.upsertFromWebhook, {
        organizationId: group.organizationId,
        lineUserId: userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
      });
    })();

    await Promise.all([storePromise, profilePromise]);
    return;
  }

  // ── Slash commands ──────────────────────────────────────────────────────────

  // /help — works even without a connected group
  if (text === "/help") {
    await replyMessage(event.replyToken, accessToken, HELP_TEXT);
    if (group?.isActive) {
      await ctx.runMutation(api.messages.storeFromWebhook, {
        organizationId: group.organizationId,
        groupChatId: group._id,
        lineMessageId: event.message.id,
        lineUserId: event.source.userId ?? "unknown",
        text,
        messageType: "text",
        timestamp: event.timestamp,
        skipAI: true,
      });
      await storeBotReply(ctx, group, event.replyToken, HELP_TEXT, event.timestamp);
    }
    return;
  }

  // Commands below require a connected group
  if (!group || !group.isActive) {
    await replyMessage(event.replyToken, accessToken, "This group is not connected to Line Buddy. Type /connect TOKEN to link it.");
    return;
  }

  // Store the user's command message (skipAI — commands are not AI-processable)
  await ctx.runMutation(api.messages.storeFromWebhook, {
    organizationId: group.organizationId,
    groupChatId: group._id,
    lineMessageId: event.message.id,
    lineUserId: event.source.userId ?? "unknown",
    text,
    messageType: "text",
    timestamp: event.timestamp,
    skipAI: true,
  });

  // /new-project NAME
  if (text.startsWith("/new-project")) {
    const projectName = text.replace(/^\/new-project\s*/i, "").trim();
    if (!projectName) {
      const reply = "Usage: /new-project PROJECT NAME";
      await replyMessage(event.replyToken, accessToken, reply);
      await storeBotReply(ctx, group, event.replyToken, reply, event.timestamp);
      return;
    }

    const templates = (await ctx.runQuery(api.workflowTemplates.list, {
      organizationId: group.organizationId,
    })) as Array<{ _id: string; name: string }>;

    if (templates.length === 0) {
      const reply = "No workflow templates found. Create one in the dashboard first.";
      await replyMessage(event.replyToken, accessToken, reply);
      await storeBotReply(ctx, group, event.replyToken, reply, event.timestamp);
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
      await replyMessage(event.replyToken, accessToken, reply);
      await storeBotReply(ctx, group, event.replyToken, reply, event.timestamp);
    } catch (err: unknown) {
      const reply = `❌ Failed to create project: ${err instanceof Error ? err.message : "Unknown error"}`;
      await replyMessage(event.replyToken, accessToken, reply);
      await storeBotReply(ctx, group, event.replyToken, reply, event.timestamp);
    }
    return;
  }

  // /projects
  if (text === "/projects") {
    const projects = (await ctx.runQuery(api.projects.getActiveByGroup, { lineGroupId: groupId })) as
      | Array<{ _id: string; name: string; status: string; currentStageOrder: number }>
      | null;

    if (!projects || projects.length === 0) {
      const reply = "No active projects in this group.\n\nCreate one with /new-project NAME";
      await replyMessage(event.replyToken, accessToken, reply);
      await storeBotReply(ctx, group, event.replyToken, reply, event.timestamp);
      return;
    }

    const list = projects.map((p, i) => `${i + 1}. ${p.name} (Stage ${p.currentStageOrder})`).join("\n");
    const reply = `📁 Active projects:\n\n${list}`;
    await replyMessage(event.replyToken, accessToken, reply);
    await storeBotReply(ctx, group, event.replyToken, reply, event.timestamp);
    return;
  }

  // /status
  if (text === "/status") {
    const projects = (await ctx.runQuery(api.projects.getActiveByGroup, { lineGroupId: groupId })) as
      | Array<{ _id: string; name: string; currentStageOrder: number }>
      | null;

    if (!projects || projects.length === 0) {
      const reply = "No active projects. Create one with /new-project NAME";
      await replyMessage(event.replyToken, accessToken, reply);
      await storeBotReply(ctx, group, event.replyToken, reply, event.timestamp);
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

    if (statusLines.length === 0) {
      const reply = "No active stages found.";
      await replyMessage(event.replyToken, accessToken, reply);
      await storeBotReply(ctx, group, event.replyToken, reply, event.timestamp);
      return;
    }
    const reply = statusLines.join("\n\n");
    await replyMessage(event.replyToken, accessToken, reply);
    await storeBotReply(ctx, group, event.replyToken, reply, event.timestamp);
    return;
  }
}

async function handleMediaMessage(ctx: any, event: LineMessageEvent, accessToken: string) {
  const groupId = event.source.groupId ?? event.source.roomId;
  if (!groupId) return;

  const group = await ctx.runQuery(api.groupChats.getByLineGroupId, { lineGroupId: groupId });
  if (!group || !group.isActive) return;

  const lineType = event.message.type as string;
  const messageType: "image" | "file" | "video" | "audio" =
    lineType === "image" ? "image"
    : lineType === "video" ? "video"
    : lineType === "audio" ? "audio"
    : "file";

  const typeLabel: Record<string, string> = {
    image: "[Image]",
    video: "[Video]",
    audio: "[Audio]",
    file: "[File attachment]",
  };

  let storageId: string | undefined;

  const media = await getMessageContent(event.message.id, accessToken);
  if (media) {
    try {
      const uploadUrl = await ctx.storage.generateUploadUrl();
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        body: media.data,
        headers: { "Content-Type": media.contentType },
      });
      if (uploadRes.ok) {
        const { storageId: sid } = await uploadRes.json();
        storageId = sid;
        // Track file storage against the org's plan limit
        ctx.runMutation(internal.billing.addStorageBytes, {
          organizationId: group.organizationId,
          bytes: media.data.byteLength,
        }).catch(() => {});
      }
    } catch (err) {
      console.error("[LINE webhook] Failed to upload media to Convex:", err);
    }
  }

  await ctx.runMutation(api.messages.storeFromWebhook, {
    organizationId: group.organizationId,
    groupChatId: group._id,
    lineMessageId: event.message.id,
    lineUserId: event.source.userId ?? "unknown",
    text: typeLabel[messageType] ?? "[Attachment]",
    storageId: storageId as Id<"_storage"> | undefined,
    messageType,
    timestamp: event.timestamp,
    replyToken: event.replyToken || undefined,
    skipAI: true,
  });
}

async function handleStickerMessage(ctx: any, event: LineMessageEvent) {
  const groupId = event.source.groupId ?? event.source.roomId;
  if (!groupId) return;

  const group = await ctx.runQuery(api.groupChats.getByLineGroupId, { lineGroupId: groupId });
  if (!group || !group.isActive) return;

  await ctx.runMutation(api.messages.storeFromWebhook, {
    organizationId: group.organizationId,
    groupChatId: group._id,
    lineMessageId: event.message.id,
    lineUserId: event.source.userId ?? "unknown",
    text: "[Sticker]",
    messageType: "sticker",
    timestamp: event.timestamp,
    skipAI: true,
  });
}

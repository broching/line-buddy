import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
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

const HELP_TEXT = `📋 Line Buddy Commands

/new-project NAME — Create a new project in this group
/projects — List active projects in this group
/status — Show current stage and missing fields
/connect TOKEN — Link this group to your organization
/help — Show this message`;

export const handleLineWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";

  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim();
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();

  if (!channelSecret || !accessToken) {
    console.error("[LINE webhook] Missing LINE_CHANNEL_SECRET or LINE_CHANNEL_ACCESS_TOKEN env vars");
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
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
      await processEvent(ctx, event, accessToken);
    } catch (err) {
      console.error(`[LINE webhook] Event error type=${(event as any).type}:`, err);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

async function processEvent(ctx: any, event: LineEvent, accessToken: string) {
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
        await handleTextMessage(ctx, msg, accessToken);
      } else if (msg.message.type === "image" || msg.message.type === "file") {
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

async function handleTextMessage(ctx: any, event: LineMessageEvent, accessToken: string) {
  const text = (event.message.text ?? "").trim();
  const groupId = event.source.groupId ?? event.source.roomId;

  // /connect TOKEN — works before group is registered
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
      await ctx.runMutation(api.groupChats.connect, {
        organizationId,
        lineGroupId: groupId,
        displayName: summary.groupName,
        pictureUrl: summary.pictureUrl,
      });
      await replyMessage(
        event.replyToken,
        accessToken,
        `✅ Connected to ${orgName}!\n\nCreate a project with /new-project NAME. Type /help for all commands.`
      );
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

  // /help — works anywhere
  if (text === "/help") {
    await replyMessage(event.replyToken, accessToken, HELP_TEXT);
    return;
  }

  if (!groupId) return;
  const group = await ctx.runQuery(api.groupChats.getByLineGroupId, { lineGroupId: groupId });

  // Non-command messages: store always; run AI only if there are active projects
  if (!text.startsWith("/")) {
    if (!group || !group.isActive) return;

    const activeProjects = await ctx.runQuery(api.projects.getActiveByGroup, { lineGroupId: groupId });
    const hasActiveProjects = Array.isArray(activeProjects) && activeProjects.length > 0;

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
      skipAI: !hasActiveProjects,
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

  // Commands below require a connected group
  if (!group || !group.isActive) {
    await replyMessage(event.replyToken, accessToken, "This group is not connected to Line Buddy. Type /connect TOKEN to link it.");
    return;
  }

  // /new-project NAME
  if (text.startsWith("/new-project")) {
    const projectName = text.replace(/^\/new-project\s*/i, "").trim();
    if (!projectName) {
      await replyMessage(event.replyToken, accessToken, "Usage: /new-project PROJECT NAME");
      return;
    }

    const templates = (await ctx.runQuery(api.workflowTemplates.list, {
      organizationId: group.organizationId,
    })) as Array<{ _id: string; name: string }>;

    if (templates.length === 0) {
      await replyMessage(event.replyToken, accessToken, "No workflow templates found. Create one in the dashboard first.");
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
    } catch (err: unknown) {
      await replyMessage(event.replyToken, accessToken, `❌ Failed to create project: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    return;
  }

  // /projects
  if (text === "/projects") {
    const projects = (await ctx.runQuery(api.projects.getActiveByGroup, { lineGroupId: groupId })) as
      | Array<{ _id: string; name: string; status: string; currentStageOrder: number }>
      | null;

    if (!projects || projects.length === 0) {
      await replyMessage(event.replyToken, accessToken, "No active projects in this group.\n\nCreate one with /new-project NAME");
      return;
    }

    const list = projects.map((p, i) => `${i + 1}. ${p.name} (Stage ${p.currentStageOrder})`).join("\n");
    await replyMessage(event.replyToken, accessToken, `📁 Active projects:\n\n${list}`);
    return;
  }

  // /status
  if (text === "/status") {
    const projects = (await ctx.runQuery(api.projects.getActiveByGroup, { lineGroupId: groupId })) as
      | Array<{ _id: string; name: string; currentStageOrder: number }>
      | null;

    if (!projects || projects.length === 0) {
      await replyMessage(event.replyToken, accessToken, "No active projects. Create one with /new-project NAME");
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
      await replyMessage(event.replyToken, accessToken, "No active stages found.");
      return;
    }
    await replyMessage(event.replyToken, accessToken, statusLines.join("\n\n"));
    return;
  }
}

async function handleMediaMessage(ctx: any, event: LineMessageEvent, accessToken: string) {
  const groupId = event.source.groupId ?? event.source.roomId;
  if (!groupId) return;

  const group = await ctx.runQuery(api.groupChats.getByLineGroupId, { lineGroupId: groupId });
  if (!group || !group.isActive) return;

  const messageType = event.message.type === "image" ? "image" : "file";
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
    text: messageType === "image" ? "[Image]" : "[File attachment]",
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

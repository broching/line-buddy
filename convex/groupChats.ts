import { action, mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { writeAuditLog } from "./lib/audit";
import { leaveGroup as callLineLeaveGroup } from "./lib/lineApi";
import { leaveGroup as callWaLeaveGroup } from "./lib/wasenderApi";
import { sendGroupMessage } from "./lib/messaging";
import { buildChannelSendInfo, resolveSendCreds } from "./lib/channelContext";
import { decryptSecret } from "./lib/crypto";

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);
    return ctx.db
      .query("groupChats")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .collect();
  },
});

export const listWithStats = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);
    const groups = await ctx.db
      .query("groupChats")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .collect();

    return Promise.all(
      groups.map(async (group) => {
        const [projects, lastMsg] = await Promise.all([
          ctx.db
            .query("projects")
            .withIndex("byGroupChatId", (q) => q.eq("groupChatId", group._id))
            .filter((q) => q.neq(q.field("status"), "archived"))
            .collect(),
          ctx.db
            .query("messages")
            .withIndex("byGroupChatAndTimestamp", (q) => q.eq("groupChatId", group._id))
            .order("desc")
            .first(),
        ]);

        const activeProjectCount = projects.filter((p) => p.status === "active").length;

        return {
          ...group,
          activeProjectCount,
          totalProjectCount: projects.length,
          lastMessageAt: lastMsg?.timestamp ?? null,
          lastMessagePreview: lastMsg?.text
            ? lastMsg.text.slice(0, 60) + (lastMsg.text.length > 60 ? "…" : "")
            : null,
          lastMessageUserId: lastMsg?.lineUserId ?? null,
        };
      })
    );
  },
});

export const get = query({
  args: { groupChatId: v.id("groupChats"), organizationId: v.id("organizations") },
  handler: async (ctx, { groupChatId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    const group = await ctx.db.get(groupChatId);
    if (!group || group.organizationId !== organizationId) return null;

    // Is this group on the org's currently-selected mode for its channel? If not,
    // it's dormant — visible, but the bot won't send/process until the org switches back.
    const org = await ctx.db.get(organizationId);
    const channel = group.channel ?? "line";
    const channelActive =
      channel === "whatsapp"
        ? (org?.whatsappMode ?? "byo") === (group.whatsappAgent ?? "byo")
        : (org?.lineMode ?? "managed") === (group.lineAgent ?? "managed");

    return { ...group, channelActive };
  },
});

// Called from the LINE / WhatsApp webhook — no user auth.
// Creates or reactivates a group chat record after a successful /connect flow.
export const connect = mutation({
  args: {
    organizationId: v.id("organizations"),
    lineGroupId: v.string(),
    displayName: v.string(),
    pictureUrl: v.optional(v.string()),
    channel: v.optional(v.union(v.literal("line"), v.literal("whatsapp"))),
    lineAgent: v.optional(v.union(v.literal("managed"), v.literal("byok"))),
    whatsappAgent: v.optional(v.union(v.literal("managed"), v.literal("byo"))),
    whatsappSessionId: v.optional(v.id("whatsappSessions")),
  },
  handler: async (ctx, { organizationId, lineGroupId, displayName, pictureUrl, channel, lineAgent, whatsappAgent, whatsappSessionId }) => {
    // Check if group already connected (possibly to another org — reject)
    const existing = await ctx.db
      .query("groupChats")
      .withIndex("byLineGroupId", (q) => q.eq("lineGroupId", lineGroupId))
      .unique();

    if (existing) {
      if (existing.organizationId !== organizationId) {
        throw new Error("This group is already connected to a different organization");
      }
      // Re-activate if previously deactivated
      await ctx.db.patch(existing._id, {
        isActive: true,
        displayName,
        pictureUrl,
        connectedAt: Date.now(),
        ...(channel ? { channel } : {}),
        ...(lineAgent ? { lineAgent } : {}),
        ...(whatsappAgent ? { whatsappAgent } : {}),
        ...(whatsappSessionId ? { whatsappSessionId } : {}),
      });
      return existing._id;
    }

    const groupChatId = await ctx.db.insert("groupChats", {
      organizationId,
      lineGroupId,
      displayName,
      pictureUrl,
      isActive: true,
      connectedAt: Date.now(),
      ...(channel ? { channel } : {}),
      ...(lineAgent ? { lineAgent } : {}),
      ...(whatsappAgent ? { whatsappAgent } : {}),
      ...(whatsappSessionId ? { whatsappSessionId } : {}),
    });

    await writeAuditLog(ctx, {
      organizationId,
      actorType: "bot",
      eventType: "groupChat.connected",
      entityType: "groupChat",
      entityId: groupChatId,
      payload: { lineGroupId, displayName },
    });

    return groupChatId;
  },
});

// Called from the LINE webhook when the bot is removed from a group.
export const deactivate = mutation({
  args: { lineGroupId: v.string() },
  handler: async (ctx, { lineGroupId }) => {
    const group = await ctx.db
      .query("groupChats")
      .withIndex("byLineGroupId", (q) => q.eq("lineGroupId", lineGroupId))
      .unique();
    if (!group) return;
    await ctx.db.patch(group._id, { isActive: false });
    await writeAuditLog(ctx, {
      organizationId: group.organizationId,
      actorType: "bot",
      eventType: "groupChat.deactivated",
      entityType: "groupChat",
      entityId: group._id,
      payload: { lineGroupId },
    });
  },
});

// Returns the groupChat for a given LINE group ID — used by webhook for routing.
export const getByLineGroupId = query({
  args: { lineGroupId: v.string() },
  handler: async (ctx, { lineGroupId }) => {
    return ctx.db
      .query("groupChats")
      .withIndex("byLineGroupId", (q) => q.eq("lineGroupId", lineGroupId))
      .unique();
  },
});

// Auth-free lookup for server-to-server API routes (send-message, storage-url, etc.).
// Validates org ownership without requiring a Clerk session.
export const getForServer = query({
  args: { groupChatId: v.id("groupChats"), organizationId: v.id("organizations") },
  handler: async (ctx, { groupChatId, organizationId }) => {
    const group = await ctx.db.get(groupChatId);
    if (!group || group.organizationId !== organizationId) return null;
    return group;
  },
});

// Internal: channel send info for a group (used by the dashboard send action).
export const sendInfo = internalQuery({
  args: { groupChatId: v.id("groupChats") },
  handler: async (ctx, { groupChatId }) => {
    const group = await ctx.db.get(groupChatId);
    if (!group) return null;
    return buildChannelSendInfo(ctx, group);
  },
});

// Send a message from the dashboard to a connected group (LINE or WhatsApp).
export const sendMessage = action({
  args: {
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
    text: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    sentByName: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, groupChatId, text, storageId, sentByName }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const group = await ctx.runQuery(api.groupChats.getForServer, { groupChatId, organizationId });
    if (!group) throw new Error("Group not found");

    const trimmed = text?.trim();
    const imageUrl: string | null = storageId ? await ctx.storage.getUrl(storageId) : null;
    if (!trimmed && !imageUrl) throw new Error("text or storageId is required");

    // Resolve channel + send credentials (handles LINE, WhatsApp BYO, and managed).
    const info = await ctx.runQuery(internal.groupChats.sendInfo, { groupChatId });
    if (!info) throw new Error("Group not found");
    const creds = await resolveSendCreds(info);
    if (!creds) {
      throw new Error(
        (group.channel ?? "line") === "whatsapp"
          ? "WhatsApp isn't connected for this organization"
          : "Messaging channel is not configured"
      );
    }
    const channel = creds.channel;

    // WhatsApp sends image + caption together; LINE sends them as separate messages.
    if (imageUrl) {
      const ok = await sendGroupMessage(creds, group.lineGroupId, {
        text: channel === "whatsapp" ? (trimmed ?? "") : "",
        imageUrl,
      });
      if (!ok) throw new Error("Failed to send image");
    }
    if (trimmed && (channel === "line" || !imageUrl)) {
      const ok = await sendGroupMessage(creds, group.lineGroupId, { text: trimmed });
      if (!ok) throw new Error("Failed to send message");
    }

    // Store the bot message in Convex for chat history
    if (trimmed) {
      await ctx.runMutation(api.messages.storeBotPush, {
        organizationId,
        groupChatId,
        text: trimmed,
        timestamp: Date.now(),
        sentByName,
      });
    }
  },
});

// Update group metadata from a WhatsApp groups.upsert event.
export const updateMetaInternal = internalMutation({
  args: {
    groupChatId: v.id("groupChats"),
    displayName: v.optional(v.string()),
    pictureUrl: v.optional(v.string()),
    memberCount: v.optional(v.number()),
  },
  handler: async (ctx, { groupChatId, displayName, pictureUrl, memberCount }) => {
    const group = await ctx.db.get(groupChatId);
    if (!group) return;
    const patch: Record<string, unknown> = {};
    if (displayName && displayName !== group.displayName) patch.displayName = displayName;
    if (pictureUrl && pictureUrl !== group.pictureUrl) patch.pictureUrl = pictureUrl;
    if (memberCount != null) patch.memberCount = memberCount;
    if (Object.keys(patch).length > 0) await ctx.db.patch(groupChatId, patch);
  },
});

// Mark a group as archived (isActive: false). Called from the leaveGroup action.
export const archiveInternal = internalMutation({
  args: { groupChatId: v.id("groupChats"), organizationId: v.id("organizations") },
  handler: async (ctx, { groupChatId, organizationId }) => {
    await ctx.db.patch(groupChatId, { isActive: false });
    await writeAuditLog(ctx, {
      organizationId,
      actorType: "user",
      eventType: "groupChat.left",
      entityType: "groupChat",
      entityId: groupChatId,
      payload: {},
    });
  },
});

// User-triggered: bot leaves the LINE group and archives it.
export const leaveGroup = action({
  args: {
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
  },
  handler: async (ctx, { organizationId, groupChatId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const group = await ctx.runQuery(api.groupChats.getForServer, { groupChatId, organizationId });
    if (!group) throw new Error("Group not found");

    // Best-effort: tell the platform to remove the bot from the group, then archive.
    if ((group.channel ?? "line") === "whatsapp") {
      const apiCtx = await ctx.runQuery(internal.whatsappSessions.getGroupApiContext, { groupChatId });
      let apiKey: string | undefined;
      if (apiCtx?.agent === "managed") apiKey = process.env.WASENDER_MANAGED_API_KEY?.trim();
      else if (apiCtx?.byoApiKeyEnc) {
        try { apiKey = await decryptSecret(apiCtx.byoApiKeyEnc); } catch { apiKey = undefined; }
      }
      if (apiKey) await callWaLeaveGroup(apiKey, group.lineGroupId);
    } else {
      const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
      if (accessToken) {
        await callLineLeaveGroup(group.lineGroupId, accessToken);
      }
    }

    await ctx.runMutation(internal.groupChats.archiveInternal, { groupChatId, organizationId });
  },
});

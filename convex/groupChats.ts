import { action, mutation, query } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { writeAuditLog } from "./lib/audit";

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
    return group;
  },
});

// Called from the LINE webhook — no user auth.
// Creates or reactivates a group chat record after a successful /connect flow.
export const connect = mutation({
  args: {
    organizationId: v.id("organizations"),
    lineGroupId: v.string(),
    displayName: v.string(),
    pictureUrl: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, lineGroupId, displayName, pictureUrl }) => {
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

// Send a message from the dashboard to a LINE group.
// Replaces the Next.js /api/groups/[groupChatId]/send-message route.
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

    const group: { lineGroupId: string; organizationId: string } | null =
      await ctx.runQuery(api.groupChats.getForServer, { groupChatId, organizationId });
    if (!group) throw new Error("Group not found");

    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
    if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN not configured");

    const messages: Array<{ type: string; text?: string; originalContentUrl?: string; previewImageUrl?: string }> = [];

    // Resolve Convex storage file → CDN URL for image messages
    if (storageId) {
      const imageUrl: string | null = await ctx.storage.getUrl(storageId);
      if (imageUrl) {
        messages.push({ type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl });
      }
    }

    if (text?.trim()) {
      messages.push({ type: "text", text: text.trim() });
    }

    if (messages.length === 0) throw new Error("text or storageId is required");

    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ to: group.lineGroupId, messages }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LINE push failed: ${res.status} ${body}`);
    }

    // Store the bot message in Convex for chat history
    if (text?.trim()) {
      await ctx.runMutation(api.messages.storeBotPush, {
        organizationId,
        groupChatId,
        text: text.trim(),
        timestamp: Date.now(),
        sentByName,
      });
    }
  },
});

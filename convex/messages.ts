import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireMembership } from "./lib/auth";
import { paginationOptsValidator } from "convex/server";

// Generate an upload URL for media received from LINE webhook (no user auth — called by server)
export const generateMediaUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

// Called from the LINE webhook (Next.js API route) — public so it can be reached without a deploy key.
// Security: LINE signature verification in the webhook handler prevents unauthorized calls.
export const storeFromWebhook = mutation({
  args: {
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
    channel: v.optional(v.union(v.literal("line"), v.literal("whatsapp"))),
    projectId: v.optional(v.id("projects")),
    lineMessageId: v.string(),
    lineUserId: v.string(),
    text: v.string(),
    storageId: v.optional(v.id("_storage")),
    messageType: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("file"),
      v.literal("video"),
      v.literal("audio"),
      v.literal("sticker"),
      v.literal("other")
    ),
    timestamp: v.number(),
    routingMethod: v.optional(
      v.union(
        v.literal("explicit_tag"),
        v.literal("user_context"),
        v.literal("ai"),
        v.literal("manual")
      )
    ),
    replyToken: v.optional(v.string()),
    quoteToken: v.optional(v.string()),
    // If true, skip AI processing (stickers, files, non-text)
    skipAI: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Dedup: LINE may re-deliver webhooks
    const existing = await ctx.db
      .query("messages")
      .withIndex("byLineMessageId", (q) => q.eq("lineMessageId", args.lineMessageId))
      .unique();
    if (existing) return existing._id;

    const { replyToken, quoteToken, skipAI, ...messageFields } = args;
    const messageId = await ctx.db.insert("messages", {
      ...messageFields,
      processingStatus: skipAI ? "complete" : "pending",
    });

    if (skipAI) return messageId;

    // 10-second batching window: accumulate messages from the same user before sending to AI.
    // This lets the AI see multi-part messages as a single coherent input.
    const pending = await ctx.db
      .query("pendingMessageGroups")
      .withIndex("byGroupAndUser", (q) =>
        q.eq("groupChatId", args.groupChatId).eq("lineUserId", args.lineUserId)
      )
      .unique();

    if (pending) {
      // Cancel the old scheduled job and reschedule for 10s from now
      if (pending.scheduledJobId) {
        await ctx.scheduler.cancel(pending.scheduledJobId);
      }
      const newJobId = await ctx.scheduler.runAfter(
        10_000,
        internal.aiChains.processMessageGroup,
        { pendingGroupId: pending._id }
      );
      await ctx.db.patch(pending._id, {
        messageIds: [...pending.messageIds, messageId],
        scheduledJobId: newJobId,
        // Use latest message's tokens for the reply
        replyToken: replyToken ?? pending.replyToken,
        quoteToken: quoteToken ?? pending.quoteToken,
      });
    } else {
      // First message in this window: create a pending group
      const pendingGroupId = await ctx.db.insert("pendingMessageGroups", {
        groupChatId: args.groupChatId,
        organizationId: args.organizationId,
        lineUserId: args.lineUserId,
        messageIds: [messageId],
        replyToken,
        quoteToken,
      });
      const jobId = await ctx.scheduler.runAfter(
        10_000,
        internal.aiChains.processMessageGroup,
        { pendingGroupId }
      );
      await ctx.db.patch(pendingGroupId, { scheduledJobId: jobId });
    }

    return messageId;
  },
});

// Store a message pushed by the bot from the dashboard UI.
// Called from the Next.js send-message API route after a successful LINE push.
export const storeBotPush = mutation({
  args: {
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
    text: v.string(),
    timestamp: v.number(),
    sentByName: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, groupChatId, text, timestamp, sentByName }) => {
    await ctx.db.insert("messages", {
      organizationId,
      groupChatId,
      lineMessageId: `dashboard_push_${groupChatId}_${timestamp}`,
      lineUserId: "system:bot",
      sentByName,
      text,
      messageType: "other",
      timestamp,
      processingStatus: "complete",
      routingMethod: "manual",
    });
  },
});

// Store a bot reply sent in response to a slash command. Deduped on replyToken.
// Called from lineWebhook after replyMessage() so command replies appear in the chat feed.
export const storeBotCommandReply = mutation({
  args: {
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
    text: v.string(),
    timestamp: v.number(),
    replyToken: v.string(),
  },
  handler: async (ctx, { organizationId, groupChatId, text, timestamp, replyToken }) => {
    const lineMessageId = `bot_reply_${replyToken}`;
    const existing = await ctx.db
      .query("messages")
      .withIndex("byLineMessageId", (q) => q.eq("lineMessageId", lineMessageId))
      .unique();
    if (existing) return existing._id;
    return ctx.db.insert("messages", {
      organizationId,
      groupChatId,
      lineMessageId,
      lineUserId: "system:bot",
      text,
      messageType: "text",
      timestamp: timestamp + 500,
      processingStatus: "complete",
    });
  },
});

// Assign a message to a project and schedule extraction. Called by the AI classification action.
export const assignToProject = internalMutation({
  args: {
    messageId: v.id("messages"),
    projectId: v.id("projects"),
    routingMethod: v.union(
      v.literal("explicit_tag"),
      v.literal("user_context"),
      v.literal("ai"),
      v.literal("manual")
    ),
  },
  handler: async (ctx, { messageId, projectId, routingMethod }) => {
    const message = await ctx.db.get(messageId);
    if (!message || message.projectId) return; // already routed
    await ctx.db.patch(messageId, { projectId, routingMethod, processingStatus: "pending" });
    // Note: extraction is handled inline by aiChains.processGroupMessage, not scheduled here
  },
});

// Recent messages for a project, joined with their extraction records.
export const recentByProject = query({
  args: {
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { projectId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    const messages = await ctx.db
      .query("messages")
      .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(25);

    return Promise.all(
      messages.map(async (msg) => {
        const extraction = await ctx.db
          .query("messageExtractions")
          .withIndex("byMessageId", (q) => q.eq("messageId", msg._id))
          .unique();
        return { ...msg, extraction: extraction ?? null };
      })
    );
  },
});

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { projectId, organizationId, paginationOpts }) => {
    await requireMembership(ctx, organizationId);
    return ctx.db
      .query("messages")
      .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
      .order("desc")
      .paginate(paginationOpts);
  },
});

// Chat-style feed: messages ordered oldest→newest, joined with extraction data.
// Used by the group detail chat panel.
export const chatFeedByGroup = query({
  args: {
    groupChatId: v.id("groupChats"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { groupChatId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    const messages = await ctx.db
      .query("messages")
      .withIndex("byGroupChatAndTimestamp", (q) => q.eq("groupChatId", groupChatId))
      .order("asc")
      .take(200);

    return Promise.all(
      messages.map(async (msg) => {
        const extraction = await ctx.db
          .query("messageExtractions")
          .withIndex("byMessageId", (q) => q.eq("messageId", msg._id))
          .unique();
        return { ...msg, extraction: extraction ?? null };
      })
    );
  },
});

// Paginated version of chatFeedByGroup — newest first, includes extractions + image URLs.
// Used by the group detail page for lazy/infinite-scroll chat loading.
export const chatFeedByGroupPaginated = query({
  args: {
    groupChatId: v.id("groupChats"),
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { groupChatId, organizationId, paginationOpts }) => {
    await requireMembership(ctx, organizationId);

    const result = await ctx.db
      .query("messages")
      .withIndex("byGroupChatAndTimestamp", (q) => q.eq("groupChatId", groupChatId))
      .order("desc")
      .paginate(paginationOpts);

    const enrichedPage = await Promise.all(
      result.page.map(async (msg) => {
        const extraction = await ctx.db
          .query("messageExtractions")
          .withIndex("byMessageId", (q) => q.eq("messageId", msg._id))
          .unique();
        const imageUrl = msg.storageId ? await ctx.storage.getUrl(msg.storageId) : null;
        return { ...msg, extraction: extraction ?? null, imageUrl };
      })
    );

    return { ...result, page: enrichedPage };
  },
});

// Paginated feed for a single project — newest first, includes extractions.
// Used by the project detail chat history tab.
export const chatFeedByProjectPaginated = query({
  args: {
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { projectId, organizationId, paginationOpts }) => {
    await requireMembership(ctx, organizationId);

    const result = await ctx.db
      .query("messages")
      .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
      .order("desc")
      .paginate(paginationOpts);

    const enrichedPage = await Promise.all(
      result.page.map(async (msg) => {
        const extraction = await ctx.db
          .query("messageExtractions")
          .withIndex("byMessageId", (q) => q.eq("messageId", msg._id))
          .unique();
        return { ...msg, extraction: extraction ?? null };
      })
    );

    return { ...result, page: enrichedPage };
  },
});

export const listByGroup = query({
  args: {
    groupChatId: v.id("groupChats"),
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { groupChatId, organizationId, paginationOpts }) => {
    await requireMembership(ctx, organizationId);
    return ctx.db
      .query("messages")
      .withIndex("byGroupChatAndTimestamp", (q) => q.eq("groupChatId", groupChatId))
      .order("desc")
      .paginate(paginationOpts);
  },
});

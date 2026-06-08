import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";

const stepValidator = v.object({
  name: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  durationMs: v.number(),
  status: v.union(v.literal("success"), v.literal("skipped"), v.literal("error")),
  details: v.string(),
  prompt: v.optional(v.string()),
});

export const store = internalMutation({
  args: {
    messageId: v.id("messages"),
    organizationId: v.id("organizations"),
    steps: v.array(stepValidator),
    totalInputTokens: v.number(),
    totalOutputTokens: v.number(),
    totalDurationMs: v.number(),
    outcome: v.string(),
  },
  handler: async (ctx, args) => {
    const traceId = await ctx.db.insert("aiTraces", {
      ...args,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.messageId, { aiTraceId: traceId });
    return traceId;
  },
});

export const getByMessageId = query({
  args: {
    messageId: v.id("messages"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { messageId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    return ctx.db
      .query("aiTraces")
      .withIndex("byMessageId", (q) => q.eq("messageId", messageId))
      .unique();
  },
});

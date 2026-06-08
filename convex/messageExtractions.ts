import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";

export const getByMessage = query({
  args: {
    messageId: v.id("messages"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { messageId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    return ctx.db
      .query("messageExtractions")
      .withIndex("byMessageId", (q) => q.eq("messageId", messageId))
      .unique();
  },
});

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { projectId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    return ctx.db
      .query("messageExtractions")
      .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(50);
  },
});

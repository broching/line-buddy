import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { paginationOptsValidator } from "convex/server";

export const listByOrg = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    actorType: v.optional(v.union(v.literal("user"), v.literal("bot"), v.literal("system"))),
    entityType: v.optional(v.string()),
    afterTs: v.optional(v.number()), // unix ms — only return logs after this time
  },
  handler: async (ctx, { organizationId, paginationOpts, actorType, entityType, afterTs }) => {
    await requireMembership(ctx, organizationId);

    const base = ctx.db
      .query("auditLogs")
      .withIndex("byOrganizationAndTimestamp", (q) => {
        const q2 = q.eq("organizationId", organizationId);
        return afterTs ? q2.gte("timestamp", afterTs) : q2;
      })
      .filter((q) => {
        const conditions = [];
        if (actorType) conditions.push(q.eq(q.field("actorType"), actorType));
        if (entityType) conditions.push(q.eq(q.field("entityType"), entityType));
        if (conditions.length === 0) return q.gt(q.field("timestamp"), 0);
        return conditions.reduce((acc, c) => q.and(acc, c));
      })
      .order("desc");

    const result = await base.paginate(paginationOpts);

    const enrichedPage = await Promise.all(
      result.page.map(async (log) => {
        const actor = log.actorId ? await ctx.db.get(log.actorId) : null;
        return {
          ...log,
          actorName:
            actor?.name ??
            (log.actorType === "bot"
              ? "LINE Bot"
              : log.actorType === "system"
                ? "System"
                : "Unknown"),
          actorInitials: actor?.name
            ? actor.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)
            : null,
        };
      })
    );

    return { ...result, page: enrichedPage };
  },
});

import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { paginationOptsValidator } from "convex/server";

export const listByOrg = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { organizationId, paginationOpts }) => {
    await requireMembership(ctx, organizationId);

    const result = await ctx.db
      .query("auditLogs")
      .withIndex("byOrganizationAndTimestamp", (q) =>
        q.eq("organizationId", organizationId)
      )
      .order("desc")
      .paginate(paginationOpts);

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
        };
      })
    );

    return { ...result, page: enrichedPage };
  },
});

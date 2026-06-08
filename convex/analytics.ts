import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";

export const getSummary = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);

    // ── Projects by status ──────────────────────────────────────────────────
    const projects = await ctx.db
      .query("projects")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .take(500);

    const projectCounts = { active: 0, completed: 0, paused: 0, archived: 0 };
    for (const p of projects) {
      projectCounts[p.status] = (projectCounts[p.status] ?? 0) + 1;
    }

    // ── Messages (last 14 days) ─────────────────────────────────────────────
    const since = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(2000);

    const messagesByDay: Record<string, number> = {};
    let recentCount = 0;
    let extractedCount = 0;

    for (const msg of recentMessages) {
      if (msg.timestamp < since) continue;
      recentCount++;
      if (msg.processingStatus === "complete") extractedCount++;
      const day = new Date(msg.timestamp).toISOString().slice(0, 10);
      messagesByDay[day] = (messagesByDay[day] ?? 0) + 1;
    }

    // ── Reminders ──────────────────────────────────────────────────────────
    const reminders = await ctx.db
      .query("reminders")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .take(500);

    const reminderCounts = { scheduled: 0, sent: 0, failed: 0, cancelled: 0 };
    for (const r of reminders) {
      reminderCounts[r.status] = (reminderCounts[r.status] ?? 0) + 1;
    }

    return {
      projects: {
        total: projects.length,
        ...projectCounts,
      },
      messages: {
        last14Days: recentCount,
        byDay: messagesByDay,
        extractedCount,
        extractionRate:
          recentCount > 0 ? Math.round((extractedCount / recentCount) * 100) : 0,
      },
      reminders: reminderCounts,
    };
  },
});

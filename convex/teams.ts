import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { writeAuditLog } from "./lib/audit";

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);
    return ctx.db
      .query("teams")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .collect();
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, name, description }) => {
    const { user, membership } = await requireMembership(ctx, organizationId);
    if (membership.isAdmin === false) throw new Error("Only admins can create teams");
    const teamId = await ctx.db.insert("teams", {
      organizationId,
      name,
      description,
      isDefault: false,
    });
    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "team.created",
      entityType: "team",
      entityId: teamId,
      payload: { name },
    });
    return teamId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    teamId: v.id("teams"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, teamId, name, description }) => {
    const { user, membership } = await requireMembership(ctx, organizationId);
    if (membership.isAdmin === false) throw new Error("Only admins can edit teams");
    const team = await ctx.db.get(teamId);
    if (!team || team.organizationId !== organizationId) throw new Error("Team not found");
    const patch: { name?: string; description?: string } = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    await ctx.db.patch(teamId, patch);
    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "team.updated",
      entityType: "team",
      entityId: teamId,
      payload: patch,
    });
  },
});

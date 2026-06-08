import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { writeAuditLog } from "./lib/audit";

export const listByOrg = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);
    const roles = await ctx.db
      .query("roles")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .collect();
    return roles;
  },
});

export const listByTeam = query({
  args: { teamId: v.id("teams"), organizationId: v.id("organizations") },
  handler: async (ctx, { teamId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    return ctx.db
      .query("roles")
      .withIndex("byTeamId", (q) => q.eq("teamId", teamId))
      .collect();
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    teamId: v.id("teams"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, teamId, name, description }) => {
    const { user, membership } = await requireMembership(ctx, organizationId);
    if (membership.isAdmin === false) throw new Error("Only admins can create roles");

    const roleId = await ctx.db.insert("roles", {
      organizationId,
      teamId,
      name,
      description,
      isDefault: false,
    });
    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "role.created",
      entityType: "role",
      entityId: roleId,
      payload: { name, teamId },
    });
    return roleId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    roleId: v.id("roles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, roleId, name, description }) => {
    const { user, membership } = await requireMembership(ctx, organizationId);
    if (membership.isAdmin === false) throw new Error("Only admins can edit roles");

    const role = await ctx.db.get(roleId);
    if (!role || role.organizationId !== organizationId) throw new Error("Role not found");

    const patch: { name?: string; description?: string } = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    await ctx.db.patch(roleId, patch);

    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "role.updated",
      entityType: "role",
      entityId: roleId,
      payload: patch,
    });
  },
});

export const remove = mutation({
  args: { organizationId: v.id("organizations"), roleId: v.id("roles") },
  handler: async (ctx, { organizationId, roleId }) => {
    const { user, membership } = await requireMembership(ctx, organizationId);
    if (membership.isAdmin === false) throw new Error("Only admins can delete roles");

    const role = await ctx.db.get(roleId);
    if (!role || role.organizationId !== organizationId) throw new Error("Role not found");
    if (role.isDefault) throw new Error("Cannot delete default roles");

    await ctx.db.delete(roleId);
    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "role.deleted",
      entityType: "role",
      entityId: roleId,
      payload: { name: role.name },
    });
  },
});

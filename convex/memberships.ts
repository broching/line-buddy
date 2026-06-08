import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership, requireUser } from "./lib/auth";
import { writeAuditLog } from "./lib/audit";

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const withUsers = await Promise.all(
      memberships.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return { ...m, user };
      })
    );
    return withUsers;
  },
});

// Add a dashboard user to the org by their email address.
// The user must have already signed up (their email is synced from Clerk via webhook).
export const addByEmail = mutation({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    isAdmin: v.boolean(),
  },
  handler: async (ctx, { organizationId, email, isAdmin }) => {
    const { user: actor, membership: actorMembership } = await requireMembership(ctx, organizationId);
    if (actorMembership.isAdmin === false) throw new Error("Only admins can invite members");

    const targetUser = await ctx.db
      .query("users")
      .withIndex("byEmail", (q) => q.eq("email", email.toLowerCase().trim()))
      .unique();

    if (!targetUser) {
      throw new Error("No account found with that email. They must sign up first.");
    }

    const existing = await ctx.db
      .query("memberships")
      .withIndex("byOrgAndUser", (q) =>
        q.eq("organizationId", organizationId).eq("userId", targetUser._id)
      )
      .unique();

    if (existing) {
      if (existing.isActive) throw new Error("This person is already a member.");
      // Re-activate if previously removed
      await ctx.db.patch(existing._id, { isActive: true, isAdmin, joinedAt: Date.now() });
      return existing._id;
    }

    const membershipId = await ctx.db.insert("memberships", {
      organizationId,
      userId: targetUser._id,
      isAdmin,
      invitedBy: actor._id,
      joinedAt: Date.now(),
      isActive: true,
    });

    await writeAuditLog(ctx, {
      organizationId,
      actorId: actor._id,
      actorType: "user",
      eventType: "membership.created",
      entityType: "membership",
      entityId: membershipId,
      payload: { userId: targetUser._id, email, isAdmin },
    });

    return membershipId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    membershipId: v.id("memberships"),
  },
  handler: async (ctx, { organizationId, membershipId }) => {
    const { user: actor, membership: actorMembership } = await requireMembership(ctx, organizationId);
    if (actorMembership.isAdmin === false) throw new Error("Only admins can remove members");

    const membership = await ctx.db.get(membershipId);
    if (!membership || membership.organizationId !== organizationId) {
      throw new Error("Membership not found");
    }

    // Prevent removing the last admin
    if (membership.isAdmin) {
      const admins = await ctx.db
        .query("memberships")
        .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
      const adminCount = admins.filter((m) => m.isAdmin !== false).length;
      if (adminCount <= 1) throw new Error("Cannot remove the last admin");
    }

    await ctx.db.patch(membershipId, { isActive: false });
    await writeAuditLog(ctx, {
      organizationId,
      actorId: actor._id,
      actorType: "user",
      eventType: "membership.removed",
      entityType: "membership",
      entityId: membershipId,
      payload: { userId: membership.userId },
    });
  },
});

export const setAdmin = mutation({
  args: {
    organizationId: v.id("organizations"),
    membershipId: v.id("memberships"),
    isAdmin: v.boolean(),
  },
  handler: async (ctx, { organizationId, membershipId, isAdmin }) => {
    const { user: actor, membership: actorMembership } = await requireMembership(ctx, organizationId);
    if (actorMembership.isAdmin === false) throw new Error("Only admins can change admin status");

    const membership = await ctx.db.get(membershipId);
    if (!membership || membership.organizationId !== organizationId) {
      throw new Error("Membership not found");
    }

    await ctx.db.patch(membershipId, { isAdmin });
    await writeAuditLog(ctx, {
      organizationId,
      actorId: actor._id,
      actorType: "user",
      eventType: "membership.admin_updated",
      entityType: "membership",
      entityId: membershipId,
      payload: { isAdmin },
    });
  },
});

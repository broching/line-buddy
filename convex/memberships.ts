import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership, computeOrgRole } from "./lib/auth";
import { writeAuditLog } from "./lib/audit";
import { PLAN_LIMITS } from "./billing";

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);
    const org = await ctx.db.get(organizationId);

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const withUsers = await Promise.all(
      memberships.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        const orgRole = computeOrgRole(m, org?.ownerId ?? m.userId);
        return { ...m, user, orgRole };
      })
    );
    return withUsers;
  },
});

// Add a dashboard user to the org by their email address.
export const addByEmail = mutation({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    orgRole: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, { organizationId, email, orgRole }) => {
    const { user: actor, membership: actorMembership } = await requireMembership(ctx, organizationId);
    const org = await ctx.db.get(organizationId);
    const actorRole = computeOrgRole(actorMembership, org?.ownerId ?? actor._id);
    if (actorRole === "member") throw new Error("Only admins can invite members");

    // Seat-limit check
    const activeMemberships = await ctx.db
      .query("memberships")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    const billing = await ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    const isActivePlan = billing?.status === "active" && (billing.creditsPeriodEnd ?? 0) > Date.now();
    const seatLimit = isActivePlan ? PLAN_LIMITS.maxSeats : 1;
    if (activeMemberships.length >= seatLimit) {
      throw new Error(
        isActivePlan
          ? `Seat limit reached (${PLAN_LIMITS.maxSeats} seats). Please upgrade to add more members.`
          : "An active subscription is required to add team members."
      );
    }

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
      await ctx.db.patch(existing._id, {
        isActive: true,
        orgRole,
        isAdmin: orgRole === "admin",
        joinedAt: Date.now(),
      });
      return existing._id;
    }

    const membershipId = await ctx.db.insert("memberships", {
      organizationId,
      userId: targetUser._id,
      orgRole,
      isAdmin: orgRole === "admin",
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
      payload: { userId: targetUser._id, email, orgRole },
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
    const org = await ctx.db.get(organizationId);
    const actorRole = computeOrgRole(actorMembership, org?.ownerId ?? actor._id);
    if (actorRole === "member") throw new Error("Only admins can remove members");

    const membership = await ctx.db.get(membershipId);
    if (!membership || membership.organizationId !== organizationId) {
      throw new Error("Membership not found");
    }

    const targetRole = computeOrgRole(membership, org?.ownerId ?? membership.userId);
    if (targetRole === "owner") throw new Error("Cannot remove the organization owner");

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

export const setRole = mutation({
  args: {
    organizationId: v.id("organizations"),
    membershipId: v.id("memberships"),
    orgRole: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, { organizationId, membershipId, orgRole }) => {
    const { user: actor, membership: actorMembership } = await requireMembership(ctx, organizationId);
    const org = await ctx.db.get(organizationId);
    const actorRole = computeOrgRole(actorMembership, org?.ownerId ?? actor._id);

    if (actorRole === "member") throw new Error("Only admins can change roles");
    if (orgRole === "owner" && actorRole !== "owner") throw new Error("Only owners can promote to owner");

    const membership = await ctx.db.get(membershipId);
    if (!membership || membership.organizationId !== organizationId) {
      throw new Error("Membership not found");
    }

    const targetRole = computeOrgRole(membership, org?.ownerId ?? membership.userId);

    // Protect: cannot demote the last owner
    if (targetRole === "owner" && orgRole !== "owner") {
      const all = await ctx.db
        .query("memberships")
        .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
      const ownerCount = all.filter((m) => computeOrgRole(m, org?.ownerId ?? m.userId) === "owner").length;
      if (ownerCount <= 1) throw new Error("Cannot demote the last owner");
    }

    await ctx.db.patch(membershipId, {
      orgRole,
      isAdmin: orgRole !== "member",
    });

    // If a new owner is being set, transfer ownerId on the org document
    if (orgRole === "owner" && actorRole === "owner") {
      await ctx.db.patch(organizationId, { ownerId: membership.userId });
    }

    await writeAuditLog(ctx, {
      organizationId,
      actorId: actor._id,
      actorType: "user",
      eventType: "membership.role_updated",
      entityType: "membership",
      entityId: membershipId,
      payload: { orgRole },
    });
  },
});

// Legacy — kept so any callers using setAdmin still compile
export const setAdmin = mutation({
  args: {
    organizationId: v.id("organizations"),
    membershipId: v.id("memberships"),
    isAdmin: v.boolean(),
  },
  handler: async (ctx, { organizationId, membershipId, isAdmin }) => {
    const { user: actor, membership: actorMembership } = await requireMembership(ctx, organizationId);
    const org = await ctx.db.get(organizationId);
    const actorRole = computeOrgRole(actorMembership, org?.ownerId ?? actor._id);
    if (actorRole === "member") throw new Error("Only admins can change admin status");

    const membership = await ctx.db.get(membershipId);
    if (!membership || membership.organizationId !== organizationId) {
      throw new Error("Membership not found");
    }

    const newOrgRole = isAdmin ? "admin" : "member";
    await ctx.db.patch(membershipId, { isAdmin, orgRole: newOrgRole });

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

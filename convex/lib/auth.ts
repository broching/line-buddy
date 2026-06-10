import { MutationCtx, QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";

export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("byExternalId", (q) => q.eq("externalId", identity.subject))
    .unique();
}

// Throws UNAUTHENTICATED if no signed-in user.
export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (!user) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not signed in" });
  return user;
}

// Computes effective org role from a membership + org ownerId.
// orgRole field takes precedence; falls back to legacy isAdmin + ownerId check.
export function computeOrgRole(
  membership: { orgRole?: "owner" | "admin" | "member" | null; isAdmin?: boolean | null; userId: Id<"users"> },
  orgOwnerId: Id<"users">
): "owner" | "admin" | "member" {
  if (membership.orgRole) return membership.orgRole;
  if (membership.userId === orgOwnerId) return "owner";
  return membership.isAdmin !== false ? "admin" : "member";
}

// Throws UNAUTHORIZED if user is not an active org member.
export async function requireMembership(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">
) {
  const user = await requireUser(ctx);
  const membership = await ctx.db
    .query("memberships")
    .withIndex("byOrgAndUser", (q) =>
      q.eq("organizationId", organizationId).eq("userId", user._id)
    )
    .unique();
  if (!membership || !membership.isActive) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Not a member of this organization" });
  }
  return { user, membership };
}

// Throws FORBIDDEN if user is not an admin or owner of the org.
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">
) {
  const { user, membership } = await requireMembership(ctx, organizationId);
  const org = await ctx.db.get(organizationId);
  const role = computeOrgRole(membership, org?.ownerId ?? user._id);
  if (role === "member") {
    throw new ConvexError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return { user, membership, role };
}

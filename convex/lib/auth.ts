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
  orgOwnerId: Id<"users"> | undefined
): "owner" | "admin" | "member" {
  if (membership.orgRole) return membership.orgRole;
  if (orgOwnerId && membership.userId === orgOwnerId) return "owner";
  return membership.isAdmin !== false ? "admin" : "member";
}

// Throws UNAUTHORIZED if user is not an active org member.
// Primary auth: JWT org_id (Clerk organization context) → maps to clerkOrgId on the org.
// Fallback: direct membership table lookup (for legacy sessions or users added via addByEmail).
export async function requireMembership(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">
) {
  const user = await requireUser(ctx);
  const identity = await ctx.auth.getUserIdentity();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clerkOrgId = (identity as any)?.org_id as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clerkOrgRole = (identity as any)?.org_role as string | undefined;

  if (clerkOrgId) {
    // JWT carries active Clerk org — find matching Convex org
    const org = await ctx.db
      .query("organizations")
      .withIndex("byClerkOrgId", (q) => q.eq("clerkOrgId", clerkOrgId))
      .unique();
    if (!org || org._id !== organizationId) {
      throw new ConvexError({ code: "UNAUTHORIZED", message: "Not authorized for this organization" });
    }

    // Check Convex membership for role info
    const membership = await ctx.db
      .query("memberships")
      .withIndex("byOrgAndUser", (q) =>
        q.eq("organizationId", organizationId).eq("userId", user._id)
      )
      .unique();

    if (membership?.isActive) {
      return { user, membership };
    }

    // Membership not yet synced (webhook race condition) — derive from JWT
    const orgRole: "owner" | "admin" | "member" =
      user._id === org.ownerId ? "owner" : clerkOrgRole === "org:admin" ? "admin" : "member";
    return {
      user,
      membership: {
        _id: "pending" as unknown as Id<"memberships">,
        _creationTime: 0,
        organizationId,
        userId: user._id,
        orgRole,
        isAdmin: orgRole !== "member",
        isActive: true,
        invitedBy: user._id,
        joinedAt: Date.now(),
      },
    };
  }

  // Fallback: no Clerk org in JWT — check membership table directly
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

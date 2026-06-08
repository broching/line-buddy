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

// Throws FORBIDDEN if user is not an admin of the org.
// undefined isAdmin is treated as true (original owner pre-migration).
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">
) {
  const { user, membership } = await requireMembership(ctx, organizationId);
  if (membership.isAdmin === false) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return { user, membership };
}

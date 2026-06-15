import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, requireMembership } from "./lib/auth";
import { writeAuditLog } from "./lib/audit";

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  let result = "LB-";
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export const generate = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const now = Date.now();

    // Expire any active tokens for this org to keep UI clean
    const existing = await ctx.db
      .query("connectTokens")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .filter((q) =>
        q.and(q.eq(q.field("consumed"), false), q.gt(q.field("expiresAt"), now))
      )
      .collect();
    for (const t of existing) {
      await ctx.db.patch(t._id, { expiresAt: now }); // expire immediately
    }

    const token = generateToken();
    await ctx.db.insert("connectTokens", {
      token,
      organizationId,
      createdBy: user._id,
      expiresAt: now + TOKEN_TTL_MS,
      consumed: false,
    });
    return token;
  },
});

// Called from the LINE webhook (public, no user auth).
// Validates token, marks it consumed, and returns the org.
export const consume = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const record = await ctx.db
      .query("connectTokens")
      .withIndex("byToken", (q) => q.eq("token", token))
      .unique();

    if (!record) throw new Error("Invalid token — double-check the code and try again");
    if (record.consumed) throw new Error("This token has already been used. Generate a new one from the dashboard and try again");
    if (record.expiresAt < Date.now()) throw new Error("Token expired — generate a new one from the dashboard");

    await ctx.db.patch(record._id, { consumed: true });

    const org = await ctx.db.get(record.organizationId);
    if (!org) throw new Error("Organization not found");

    return { organizationId: record.organizationId, orgName: org.name };
  },
});

// Returns active (unconsumed, unexpired) tokens for an org — for dashboard display.
export const listActive = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);
    const now = Date.now();
    return ctx.db
      .query("connectTokens")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .filter((q) =>
        q.and(q.eq(q.field("consumed"), false), q.gt(q.field("expiresAt"), now))
      )
      .collect();
  },
});

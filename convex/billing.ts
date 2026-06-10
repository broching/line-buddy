import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { requireMembership, computeOrgRole } from "./lib/auth";
import { Id } from "./_generated/dataModel";

// ─── Constants ────────────────────────────────────────────────────────────────

export const PAID_PLAN_ID = "cplan_3Ek3Jnh7a5kSARlBfINVtBSCetn";

export const PLAN_LIMITS = {
  creditsPerPeriod: 10_000,
  storageLimitBytes: 1_073_741_824, // 1 GB
  maxSeats: 5,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isWithinPeriod(periodEnd: number | undefined): boolean {
  if (!periodEnd) return false;
  return Date.now() < periodEnd;
}

// Returns true if org currently has an active paid subscription.
export function billingIsActive(billing: {
  status: string;
  creditsPeriodEnd?: number;
}): boolean {
  return billing.status === "active" && isWithinPeriod(billing.creditsPeriodEnd);
}

// ─── Public queries ───────────────────────────────────────────────────────────

export const getForOrg = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);

    const billing = await ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .unique();

    if (!billing) {
      return {
        isActive: false,
        status: "free" as const,
        planId: "free",
        creditsTotal: 0,
        creditsUsed: 0,
        creditsRemaining: 0,
        creditsPct: 0,
        storageUsedBytes: 0,
        storageLimitBytes: 0,
        storagePct: 0,
        maxSeats: 1,
        creditsPeriodEnd: null as number | null,
      };
    }

    const isActive = billingIsActive(billing);
    const creditsRemaining = Math.max(0, billing.creditsTotal - billing.creditsUsed);
    const creditsPct =
      billing.creditsTotal > 0
        ? Math.min(100, Math.round((billing.creditsUsed / billing.creditsTotal) * 100))
        : 0;
    const storagePct =
      PLAN_LIMITS.storageLimitBytes > 0
        ? Math.min(
            100,
            Math.round((billing.storageUsedBytes / PLAN_LIMITS.storageLimitBytes) * 100)
          )
        : 0;

    return {
      isActive,
      status: billing.status,
      planId: billing.planId,
      creditsTotal: billing.creditsTotal,
      creditsUsed: billing.creditsUsed,
      creditsRemaining,
      creditsPct,
      storageUsedBytes: billing.storageUsedBytes,
      storageLimitBytes: isActive ? PLAN_LIMITS.storageLimitBytes : 0,
      storagePct,
      maxSeats: isActive ? PLAN_LIMITS.maxSeats : 1,
      creditsPeriodEnd: billing.creditsPeriodEnd ?? null,
    };
  },
});

// ─── Internal: get or init ────────────────────────────────────────────────────

export const getOrInitForOrg = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    return ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
  },
});

// ─── Internal: credit consumption ────────────────────────────────────────────

// Returns whether this org can run AI processing. Does NOT consume credits.
export const checkCanProcess = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const billing = await ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .unique();

    if (!billing || !billingIsActive(billing)) {
      // No active plan — allow processing (no billing enforcement)
      return { canProcess: true, reason: "no_active_plan" } as const;
    }
    if (billing.creditsUsed >= billing.creditsTotal) {
      return { canProcess: false, reason: "credits_exhausted" } as const;
    }
    return { canProcess: true, creditsRemaining: billing.creditsTotal - billing.creditsUsed } as const;
  },
});

// Deduct `amount` credits based on actual token usage. Formula: max(1, round(tokens/1000)).
export const consumeCredits = internalMutation({
  args: { organizationId: v.id("organizations"), amount: v.number() },
  handler: async (ctx, { organizationId, amount }) => {
    if (amount <= 0) return;
    const billing = await ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (!billing || !billingIsActive(billing)) return;
    await ctx.db.patch(billing._id, {
      creditsUsed: billing.creditsUsed + amount,
      updatedAt: Date.now(),
    });
  },
});

// @deprecated — use checkCanProcess + consumeCredits instead
export const consumeCredit = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const billing = await ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (!billing || !billingIsActive(billing)) {
      return { success: true, reason: "no_active_plan" } as const;
    }
    if (billing.creditsUsed >= billing.creditsTotal) {
      return { success: false, reason: "credits_exhausted" } as const;
    }
    await ctx.db.patch(billing._id, {
      creditsUsed: billing.creditsUsed + 1,
      updatedAt: Date.now(),
    });
    return { success: true, creditsRemaining: billing.creditsTotal - billing.creditsUsed - 1 } as const;
  },
});

// ─── Internal: storage tracking ──────────────────────────────────────────────

export const addStorageBytes = internalMutation({
  args: { organizationId: v.id("organizations"), bytes: v.number() },
  handler: async (ctx, { organizationId, bytes }) => {
    const billing = await ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (!billing) return;
    await ctx.db.patch(billing._id, {
      storageUsedBytes: billing.storageUsedBytes + bytes,
      updatedAt: Date.now(),
    });
  },
});

export const deductStorageBytes = internalMutation({
  args: { organizationId: v.id("organizations"), bytes: v.number() },
  handler: async (ctx, { organizationId, bytes }) => {
    const billing = await ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (!billing) return;
    await ctx.db.patch(billing._id, {
      storageUsedBytes: Math.max(0, billing.storageUsedBytes - bytes),
      updatedAt: Date.now(),
    });
  },
});

// ─── Internal: activate from Clerk payment ───────────────────────────────────

export const activateFromPayment = internalMutation({
  args: {
    clerkUserId: v.string(),
    planId: v.string(),
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, { clerkUserId, planId, periodStart, periodEnd }) => {
    // Find the Convex user
    const user = await ctx.db
      .query("users")
      .withIndex("byExternalId", (q) => q.eq("externalId", clerkUserId))
      .unique();
    if (!user) {
      console.warn(`[billing] activateFromPayment: no user found for Clerk ID ${clerkUserId}`);
      return;
    }

    // Find org(s) where this user is the owner
    const ownedOrgs = await ctx.db
      .query("organizations")
      .withIndex("byOwnerId", (q) => q.eq("ownerId", user._id))
      .collect();

    if (ownedOrgs.length === 0) {
      console.warn(`[billing] activateFromPayment: user ${user._id} owns no orgs`);
      return;
    }

    // Activate billing for all owned orgs (typically just one)
    for (const org of ownedOrgs) {
      const existing = await ctx.db
        .query("orgBilling")
        .withIndex("byOrganizationId", (q) => q.eq("organizationId", org._id))
        .unique();

      if (existing) {
        // Reset credits for new billing period
        const isNewPeriod = periodStart > (existing.creditsPeriodStart ?? 0);
        await ctx.db.patch(existing._id, {
          subscriberUserId: user._id,
          planId,
          status: "active",
          creditsTotal: PLAN_LIMITS.creditsPerPeriod,
          creditsUsed: isNewPeriod ? 0 : existing.creditsUsed,
          creditsPeriodStart: periodStart,
          creditsPeriodEnd: periodEnd,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("orgBilling", {
          organizationId: org._id,
          subscriberUserId: user._id,
          planId,
          status: "active",
          creditsTotal: PLAN_LIMITS.creditsPerPeriod,
          creditsUsed: 0,
          creditsPeriodStart: periodStart,
          creditsPeriodEnd: periodEnd,
          storageUsedBytes: 0,
          updatedAt: Date.now(),
        });
      }

      console.log(`[billing] Activated plan ${planId} for org ${org._id}, period ends ${new Date(periodEnd).toISOString()}`);
    }
  },
});

// ─── Mutation: ensure free billing record exists for a new org ─────────────

export const initFreeForOrg = internalMutation({
  args: { organizationId: v.id("organizations"), userId: v.id("users") },
  handler: async (ctx, { organizationId, userId }) => {
    const existing = await ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (existing) return;
    await ctx.db.insert("orgBilling", {
      organizationId,
      subscriberUserId: userId,
      planId: "free",
      status: "free",
      creditsTotal: 0,
      creditsUsed: 0,
      storageUsedBytes: 0,
      updatedAt: Date.now(),
    });
  },
});

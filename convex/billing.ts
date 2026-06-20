import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireMembership, computeOrgRole } from "./lib/auth";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { CREDIT_PACKS, PackId } from "./lib/creditPacks";

// ─── Constants ────────────────────────────────────────────────────────────────

export const PAID_PLAN_ID = "cplan_3Ek3Jnh7a5kSARlBfINVtBSCetn";

export const PLAN_LIMITS = {
  creditsPerPeriod: 1_000,
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
        stripeCustomerId: null as string | null,
        autoRechargeEnabled: false,
        autoRechargeThreshold: null as number | null,
        autoRechargePack: null as string | null,
        monthlySpendLimitSGD: null as number | null,
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
      stripeCustomerId: billing.stripeCustomerId ?? null,
      autoRechargeEnabled: billing.autoRechargeEnabled ?? false,
      autoRechargeThreshold: billing.autoRechargeThreshold ?? null,
      autoRechargePack: billing.autoRechargePack ?? null,
      monthlySpendLimitSGD: billing.monthlySpendLimitSGD ?? null,
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

// Deduct `amount` credits based on actual token usage. Formula: ceil(tokens/1000).
// Also writes a ledger entry and triggers auto-recharge if configured.
export const consumeCredits = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    amount: v.number(),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, { organizationId, amount, description, metadata }) => {
    if (amount <= 0) return;
    const billing = await ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (!billing || !billingIsActive(billing)) return;
    const newUsed = billing.creditsUsed + amount;
    await ctx.db.patch(billing._id, {
      creditsUsed: newUsed,
      updatedAt: Date.now(),
    });

    // Ledger entry
    const balanceAfter = Math.max(0, billing.creditsTotal - newUsed);
    await ctx.db.insert("creditTransactions", {
      organizationId,
      type: "usage",
      amount: -amount,
      balanceAfter,
      description: description ?? "AI processing",
      metadata,
      createdAt: Date.now(),
    });

    // Trigger auto-recharge if balance dropped below threshold
    const shouldAutoRecharge =
      billing.autoRechargeEnabled &&
      billing.autoRechargePack &&
      billing.stripeCustomerId &&
      typeof billing.autoRechargeThreshold === "number" &&
      balanceAfter < billing.autoRechargeThreshold &&
      !billing.autoRechargeInProgress;

    if (shouldAutoRecharge) {
      await ctx.scheduler.runAfter(0, internal.stripe.triggerAutoRecharge, { organizationId });
    }
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
    clerkOrgId: v.optional(v.string()),
    planId: v.string(),
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, { clerkUserId, clerkOrgId, planId, periodStart, periodEnd }) => {
    // Resolve which org(s) to activate billing for
    const resolveOrgs = async () => {
      if (clerkOrgId) {
        // Org billing: look up by Clerk org ID directly
        const org = await ctx.db
          .query("organizations")
          .withIndex("byClerkOrgId", (q) => q.eq("clerkOrgId", clerkOrgId))
          .unique();
        if (!org) {
          console.warn(`[billing] activateFromPayment: no org found for Clerk org ${clerkOrgId}`);
          return null;
        }
        return [org];
      }
      // User billing fallback: find user then their owned orgs
      const user = await ctx.db
        .query("users")
        .withIndex("byExternalId", (q) => q.eq("externalId", clerkUserId))
        .unique();
      if (!user) {
        console.warn(`[billing] activateFromPayment: no user found for Clerk ID ${clerkUserId}`);
        return null;
      }
      const owned = await ctx.db
        .query("organizations")
        .withIndex("byOwnerId", (q) => q.eq("ownerId", user._id))
        .collect();
      if (owned.length === 0) {
        console.warn(`[billing] activateFromPayment: user ${user._id} owns no orgs`);
        return null;
      }
      return owned;
    };

    const orgsToActivate = await resolveOrgs();
    if (!orgsToActivate) return;

    // Activate billing for the resolved org(s)
    for (const org of orgsToActivate) {
      const existing = await ctx.db
        .query("orgBilling")
        .withIndex("byOrganizationId", (q) => q.eq("organizationId", org._id))
        .unique();

      if (existing) {
        // Reset credits for new billing period
        const isNewPeriod = periodStart > (existing.creditsPeriodStart ?? 0);
        await ctx.db.patch(existing._id, {
          subscriberUserId: org.ownerId,
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
          subscriberUserId: org.ownerId,
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

// ─── Stripe: set customer ID ──────────────────────────────────────────────────

export const setStripeCustomerId = internalMutation({
  args: { organizationId: v.id("organizations"), stripeCustomerId: v.string() },
  handler: async (ctx, { organizationId, stripeCustomerId }) => {
    const billing = await ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (!billing) return;
    await ctx.db.patch(billing._id, { stripeCustomerId, updatedAt: Date.now() });
  },
});

// ─── Stripe: add credits from a purchase (top-up or auto-recharge) ────────────

export const addCreditsFromStripe = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    amount: v.number(),
    type: v.union(v.literal("purchase"), v.literal("auto_recharge")),
    description: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
    stripeCheckoutSessionId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, { organizationId, amount, type, description, stripePaymentIntentId, stripeCheckoutSessionId, metadata }) => {
    const billing = await ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (!billing) {
      console.error(`[billing] addCreditsFromStripe: no billing record for org ${organizationId}`);
      return;
    }
    const newTotal = billing.creditsTotal + amount;
    await ctx.db.patch(billing._id, {
      creditsTotal: newTotal,
      updatedAt: Date.now(),
    });
    const balanceAfter = newTotal - billing.creditsUsed;
    await ctx.db.insert("creditTransactions", {
      organizationId,
      type,
      amount,
      balanceAfter,
      description,
      stripePaymentIntentId,
      stripeCheckoutSessionId,
      metadata,
      createdAt: Date.now(),
    });
    console.log(`[billing] +${amount} credits for org ${organizationId} (${type}), new balance: ${balanceAfter}`);
  },
});

// ─── Stripe webhook: idempotency helpers ─────────────────────────────────────

export const wasEventProcessed = internalQuery({
  args: { stripeEventId: v.string() },
  handler: async (ctx, { stripeEventId }) => {
    const existing = await ctx.db
      .query("stripeEvents")
      .withIndex("byStripeEventId", (q) => q.eq("stripeEventId", stripeEventId))
      .unique();
    return existing !== null;
  },
});

export const markEventProcessed = internalMutation({
  args: { stripeEventId: v.string(), type: v.string() },
  handler: async (ctx, { stripeEventId, type }) => {
    const existing = await ctx.db
      .query("stripeEvents")
      .withIndex("byStripeEventId", (q) => q.eq("stripeEventId", stripeEventId))
      .unique();
    if (existing) return;
    await ctx.db.insert("stripeEvents", { stripeEventId, type, processedAt: Date.now() });
  },
});

// Atomic: mark event + grant credits in a single transaction (prevents double-crediting)
export const processCheckoutCompleted = internalMutation({
  args: {
    stripeEventId: v.string(),
    sessionId: v.string(),
    paymentIntentId: v.optional(v.string()),
    organizationId: v.string(), // comes from Stripe metadata (untyped string)
    packId: v.string(),
    amountCents: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    // Idempotency: check + mark atomically
    const existing = await ctx.db
      .query("stripeEvents")
      .withIndex("byStripeEventId", (q) => q.eq("stripeEventId", args.stripeEventId))
      .unique();
    if (existing) return { alreadyProcessed: true };

    await ctx.db.insert("stripeEvents", {
      stripeEventId: args.stripeEventId,
      type: "checkout.session.completed",
      processedAt: Date.now(),
    });

    const pack = CREDIT_PACKS[args.packId as PackId];
    if (!pack) {
      console.error(`[billing] processCheckoutCompleted: unknown packId "${args.packId}"`);
      return { error: "unknown_pack" };
    }

    const orgId = args.organizationId as Id<"organizations">;
    const billing = await ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", orgId))
      .unique();
    if (!billing) {
      console.error(`[billing] processCheckoutCompleted: no billing record for org ${orgId}`);
      return { error: "no_billing_record" };
    }

    const newTotal = billing.creditsTotal + pack.credits;
    await ctx.db.patch(billing._id, {
      creditsTotal: newTotal,
      updatedAt: Date.now(),
    });

    const balanceAfter = newTotal - billing.creditsUsed;

    await ctx.db.insert("creditTransactions", {
      organizationId: orgId,
      type: "purchase",
      amount: pack.credits,
      balanceAfter,
      description: `Purchased ${pack.label}`,
      stripePaymentIntentId: args.paymentIntentId,
      stripeCheckoutSessionId: args.sessionId,
      metadata: { priceSGD: pack.priceSGD, packId: args.packId },
      createdAt: Date.now(),
    });

    await ctx.db.insert("stripePayments", {
      organizationId: orgId,
      stripePaymentIntentId: args.paymentIntentId ?? args.sessionId,
      stripeCheckoutSessionId: args.sessionId,
      amountCents: args.amountCents,
      currency: args.currency,
      status: "succeeded",
      creditsPurchased: pack.credits,
      packId: args.packId,
      createdAt: Date.now(),
      completedAt: Date.now(),
    });

    console.log(`[billing] Checkout completed: +${pack.credits} credits for org ${orgId}`);
    return { success: true, creditsAdded: pack.credits };
  },
});

// ─── Auto-recharge: lock/unlock ───────────────────────────────────────────────

export const setAutoRechargeInProgress = internalMutation({
  args: { organizationId: v.id("organizations"), inProgress: v.boolean() },
  handler: async (ctx, { organizationId, inProgress }) => {
    const billing = await ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (!billing) return;
    await ctx.db.patch(billing._id, { autoRechargeInProgress: inProgress, updatedAt: Date.now() });
  },
});

// ─── Stripe: monthly spend query ─────────────────────────────────────────────

export const getMonthlyStripeSGD = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const txs = await ctx.db
      .query("creditTransactions")
      .withIndex("byOrganizationAndCreatedAt", (q) =>
        q.eq("organizationId", organizationId).gte("createdAt", monthStart)
      )
      .collect();
    return txs
      .filter((t) => t.type === "purchase" || t.type === "auto_recharge")
      .reduce((sum, t) => sum + ((t.metadata as any)?.priceSGD ?? 0), 0);
  },
});

// ─── Public: get org owner info (for Stripe customer creation) ─────────────────

export const getOrgOwnerInfo = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const org = await ctx.db.get(organizationId);
    if (!org) return null;
    const owner = await ctx.db.get(org.ownerId);
    return { orgName: org.name, ownerEmail: owner?.email ?? null };
  },
});

// ─── Auth helper for Node.js actions ─────────────────────────────────────────

export const isOrgMember = internalQuery({
  args: { externalId: v.string(), organizationId: v.id("organizations") },
  handler: async (ctx, { externalId, organizationId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("byExternalId", (q) => q.eq("externalId", externalId))
      .unique();
    if (!user) return false;
    const membership = await ctx.db
      .query("memberships")
      .withIndex("byOrgAndUser", (q) =>
        q.eq("organizationId", organizationId).eq("userId", user._id)
      )
      .unique();
    return membership?.isActive ?? false;
  },
});

// ─── Public mutations: auto-recharge & monthly cap settings ──────────────────

export const updateAutoRechargeSettings = mutation({
  args: {
    organizationId: v.id("organizations"),
    enabled: v.boolean(),
    threshold: v.optional(v.number()),
    pack: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, enabled, threshold, pack }) => {
    await requireMembership(ctx, organizationId);
    const billing = await ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (!billing) throw new ConvexError("No billing record found");
    await ctx.db.patch(billing._id, {
      autoRechargeEnabled: enabled,
      autoRechargeThreshold: threshold,
      autoRechargePack: pack,
      updatedAt: Date.now(),
    });
  },
});

export const updateMonthlySpendLimit = mutation({
  args: {
    organizationId: v.id("organizations"),
    limitSGD: v.optional(v.number()), // null/undefined = no limit
  },
  handler: async (ctx, { organizationId, limitSGD }) => {
    await requireMembership(ctx, organizationId);
    const billing = await ctx.db
      .query("orgBilling")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (!billing) throw new ConvexError("No billing record found");
    await ctx.db.patch(billing._id, {
      monthlySpendLimitSGD: limitSGD,
      updatedAt: Date.now(),
    });
  },
});

// ─── Public query: transaction history ───────────────────────────────────────

// ─── Public: Clerk subscription payment history ───────────────────────────────

export const getClerkPaymentAttempts = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, limit = 20 }) => {
    await requireMembership(ctx, organizationId);
    const org = await ctx.db.get(organizationId);
    if (!org) return [];

    const attempts = await ctx.db
      .query("paymentAttempts")
      .withIndex("byUserId", (q) => q.eq("userId", org.ownerId))
      .collect();

    return attempts
      .filter((a) => a.status === "paid" && a.subscription_items.length > 0)
      .sort((a, b) => (b.paid_at ?? b.billing_date) - (a.paid_at ?? a.billing_date))
      .slice(0, limit)
      .map((a) => ({
        paymentId: a.payment_id,
        paidAt: a.paid_at ?? a.billing_date,
        amountFormatted: a.totals.grand_total.amount_formatted,
        currencySymbol: a.totals.grand_total.currency_symbol,
        planName: a.subscription_items[0]?.plan.name ?? "Subscription",
        cardType: a.payment_source.card_type,
        last4: a.payment_source.last4,
      }));
  },
});

// ─── Public: Stripe credit transaction history ────────────────────────────────

export const getTransactionHistory = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, limit = 50 }) => {
    await requireMembership(ctx, organizationId);
    return ctx.db
      .query("creditTransactions")
      .withIndex("byOrganizationAndCreatedAt", (q) =>
        q.eq("organizationId", organizationId)
      )
      .filter((q) => q.neq(q.field("type"), "usage"))
      .order("desc")
      .take(limit);
  },
});

// ─── Public: AI credit usage history (for analytics page) ────────────────────

export const getUsageHistory = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, { organizationId, paginationOpts, search, projectId }) => {
    await requireMembership(ctx, organizationId);

    const result = await ctx.db
      .query("creditTransactions")
      .withIndex("byOrganizationAndCreatedAt", (q) =>
        q.eq("organizationId", organizationId)
      )
      .filter((q) => q.eq(q.field("type"), "usage"))
      .order("desc")
      .paginate(paginationOpts);

    const enriched = await Promise.all(
      result.page.map(async (tx) => {
        const messageId = tx.metadata?.messageId as string | undefined;
        const message = messageId ? await ctx.db.get(messageId as Id<"messages">) : null;
        const groupChat = message?.groupChatId ? await ctx.db.get(message.groupChatId) : null;
        const project = message?.projectId ? await ctx.db.get(message.projectId) : null;
        return {
          ...tx,
          message: message ? { _id: message._id, text: message.text ?? null } : null,
          groupChat: groupChat ? { _id: groupChat._id, name: groupChat.displayName } : null,
          project: project ? { _id: project._id, name: project.name } : null,
        };
      })
    );

    const search_ = search?.trim().toLowerCase();
    const page = enriched.filter((tx) => {
      if (projectId && tx.project?._id !== projectId) return false;
      if (search_) {
        const haystack = `${tx.description} ${tx.message?.text ?? ""} ${tx.groupChat?.name ?? ""} ${tx.project?.name ?? ""}`.toLowerCase();
        if (!haystack.includes(search_)) return false;
      }
      return true;
    });

    return { ...result, page };
  },
});

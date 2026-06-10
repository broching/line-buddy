"use node";

import { internalAction, action } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import Stripe from "stripe";
import { CREDIT_PACKS, PackId } from "./lib/creditPacks";

function getStripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

async function assertMembership(
  ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> }; runQuery: Function },
  organizationId: Id<"organizations">
): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not authenticated");
  const isMember = await ctx.runQuery(internal.billing.isOrgMember, {
    externalId: identity.subject,
    organizationId,
  });
  if (!isMember) throw new ConvexError("Not authorized");
}

// Local helper — resolves or creates the Stripe customer for an org.
// Called directly from action handlers (no circular action reference).
async function resolveStripeCustomer(
  ctx: { runQuery: Function; runMutation: Function },
  organizationId: Id<"organizations">
): Promise<string> {
  const billing = await ctx.runQuery(internal.billing.getOrInitForOrg, { organizationId });
  if (billing?.stripeCustomerId) return billing.stripeCustomerId as string;

  const info = await ctx.runQuery(internal.billing.getOrgOwnerInfo, { organizationId });
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: (info as any)?.ownerEmail ?? undefined,
    name: (info as any)?.orgName ?? undefined,
    metadata: { organizationId },
  });

  await ctx.runMutation(internal.billing.setStripeCustomerId, {
    organizationId,
    stripeCustomerId: customer.id,
  });

  return customer.id;
}

// ─── Create Stripe Checkout Session ─────────────────────────────────────────

export const createCheckoutSession = action({
  args: {
    organizationId: v.id("organizations"),
    packId: v.string(),
    returnPath: v.string(),
  },
  handler: async (ctx, { organizationId, packId, returnPath }): Promise<{ url: string | null }> => {
    await assertMembership(ctx, organizationId);

    if (!(packId in CREDIT_PACKS)) {
      throw new ConvexError(`Invalid pack ID: ${packId}`);
    }
    const pack = CREDIT_PACKS[packId as PackId];

    const priceId = process.env[`STRIPE_PRICE_ID_${packId}`];
    if (!priceId) {
      throw new ConvexError(`Missing env var: STRIPE_PRICE_ID_${packId}`);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const customerId = await resolveStripeCustomer(ctx, organizationId);
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        organizationId,
        packId,
        credits: String(pack.credits),
        priceSGD: String(pack.priceSGD),
      },
      success_url: `${appUrl}/stripe/success?return=${encodeURIComponent(returnPath)}`,
      cancel_url: `${appUrl}/stripe/cancel?return=${encodeURIComponent(returnPath)}`,
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: { organizationId, packId },
      },
    });

    return { url: session.url };
  },
});

// ─── Create SetupIntent (for saving a card without a charge) ─────────────────

export const createSetupIntent = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }): Promise<{ clientSecret: string }> => {
    await assertMembership(ctx, organizationId);
    const customerId = await resolveStripeCustomer(ctx, organizationId);
    const stripe = getStripe();
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
    });
    if (!setupIntent.client_secret) throw new ConvexError("Failed to create setup intent");
    return { clientSecret: setupIntent.client_secret };
  },
});

// ─── Get saved payment methods ───────────────────────────────────────────────

export const getPaymentMethods = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }): Promise<{
    paymentMethods: Array<{ id: string; brand: string; last4: string; expMonth: number; expYear: number; isDefault: boolean }>;
    defaultPaymentMethodId: string | null;
  }> => {
    await assertMembership(ctx, organizationId);

    const billing = await ctx.runQuery(internal.billing.getOrInitForOrg, { organizationId });
    const stripeCustomerId = (billing as any)?.stripeCustomerId as string | undefined;
    if (!stripeCustomerId) {
      return { paymentMethods: [], defaultPaymentMethodId: null };
    }

    const stripe = getStripe();
    const [methods, customer] = await Promise.all([
      stripe.paymentMethods.list({ customer: stripeCustomerId, type: "card" }),
      stripe.customers.retrieve(stripeCustomerId, {
        expand: ["invoice_settings.default_payment_method"],
      }),
    ]);

    let defaultPmId: string | null = null;
    if (!("deleted" in customer)) {
      const defaultPm = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
      defaultPmId = typeof defaultPm === "string" ? defaultPm : ((defaultPm as Stripe.PaymentMethod)?.id ?? null);
    }

    return {
      paymentMethods: methods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? "unknown",
        last4: pm.card?.last4 ?? "????",
        expMonth: pm.card?.exp_month ?? 0,
        expYear: pm.card?.exp_year ?? 0,
        isDefault: pm.id === defaultPmId,
      })),
      defaultPaymentMethodId: defaultPmId,
    };
  },
});

// ─── Set default payment method ──────────────────────────────────────────────

export const setDefaultPaymentMethod = action({
  args: {
    organizationId: v.id("organizations"),
    paymentMethodId: v.string(),
  },
  handler: async (ctx, { organizationId, paymentMethodId }): Promise<{ success: boolean }> => {
    await assertMembership(ctx, organizationId);
    const billing = await ctx.runQuery(internal.billing.getOrInitForOrg, { organizationId });
    const stripeCustomerId = (billing as any)?.stripeCustomerId as string | undefined;
    if (!stripeCustomerId) throw new ConvexError("No Stripe customer");
    const stripe = getStripe();
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    return { success: true };
  },
});

// ─── Remove payment method ───────────────────────────────────────────────────

export const removePaymentMethod = action({
  args: {
    organizationId: v.id("organizations"),
    paymentMethodId: v.string(),
  },
  handler: async (ctx, { organizationId, paymentMethodId }): Promise<{ success: boolean }> => {
    await assertMembership(ctx, organizationId);
    const billing = await ctx.runQuery(internal.billing.getOrInitForOrg, { organizationId });
    const stripeCustomerId = (billing as any)?.stripeCustomerId as string | undefined;
    if (!stripeCustomerId) throw new ConvexError("No Stripe customer");
    const stripe = getStripe();
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== stripeCustomerId) {
      throw new ConvexError("Payment method does not belong to this org");
    }
    await stripe.paymentMethods.detach(paymentMethodId);
    return { success: true };
  },
});

// ─── Auto-recharge ───────────────────────────────────────────────────────────

export const triggerAutoRecharge = internalAction({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }): Promise<void> => {
    const billing = await ctx.runQuery(internal.billing.getOrInitForOrg, { organizationId });
    if (!billing) return;

    const b = billing as any;
    if (!b.autoRechargeEnabled || !b.autoRechargePack || !b.stripeCustomerId) return;
    if (b.autoRechargeInProgress) return;

    const packId = b.autoRechargePack as PackId;
    const pack = CREDIT_PACKS[packId];
    if (!pack) return;

    // Check monthly spend cap
    if (typeof b.monthlySpendLimitSGD === "number") {
      const monthlySpent = (await ctx.runQuery(internal.billing.getMonthlyStripeSGD, { organizationId })) as number;
      if (monthlySpent + pack.priceSGD > b.monthlySpendLimitSGD) {
        console.log(
          `[stripe] Auto-recharge blocked: monthly cap S$${b.monthlySpendLimitSGD} ` +
          `(spent S$${monthlySpent}, next S$${pack.priceSGD})`
        );
        return;
      }
    }

    // Check balance is still below threshold
    const balance = b.creditsTotal - b.creditsUsed;
    if (typeof b.autoRechargeThreshold === "number" && balance >= b.autoRechargeThreshold) return;

    // Acquire lock
    await ctx.runMutation(internal.billing.setAutoRechargeInProgress, { organizationId, inProgress: true });

    try {
      const stripe = getStripe();
      const customer = await stripe.customers.retrieve(b.stripeCustomerId as string, {
        expand: ["invoice_settings.default_payment_method"],
      }) as Stripe.Customer;

      if ("deleted" in customer) throw new Error("Stripe customer deleted");

      const defaultPm = customer.invoice_settings?.default_payment_method;
      const pmId = typeof defaultPm === "string" ? defaultPm : ((defaultPm as Stripe.PaymentMethod)?.id ?? null);
      if (!pmId) throw new Error("No default payment method for auto-recharge");

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(pack.priceSGD * 100),
        currency: "sgd",
        customer: b.stripeCustomerId as string,
        payment_method: pmId,
        confirm: true,
        off_session: true,
        metadata: {
          organizationId,
          packId,
          credits: String(pack.credits),
          priceSGD: String(pack.priceSGD),
          source: "auto_recharge",
        },
      });

      if (paymentIntent.status === "succeeded") {
        await ctx.runMutation(internal.billing.addCreditsFromStripe, {
          organizationId,
          amount: pack.credits,
          type: "auto_recharge",
          description: `Auto-recharge: ${pack.label}`,
          stripePaymentIntentId: paymentIntent.id,
          metadata: { priceSGD: pack.priceSGD, packId },
        });
        console.log(`[stripe] Auto-recharge succeeded: +${pack.credits} credits for org ${organizationId}`);
      } else {
        console.error(`[stripe] Auto-recharge PaymentIntent status: ${paymentIntent.status}`);
      }
    } catch (err) {
      console.error("[stripe] Auto-recharge failed:", err);
    } finally {
      await ctx.runMutation(internal.billing.setAutoRechargeInProgress, {
        organizationId,
        inProgress: false,
      });
    }
  },
});

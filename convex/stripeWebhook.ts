import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Verify Stripe webhook signature using Web Crypto API (works in V8 runtime).
// Stripe signs with HMAC-SHA256: the signed payload is `${timestamp}.${rawBody}`.
async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const pairs = sigHeader.split(",");
  let timestamp: string | null = null;
  const v1Signatures: string[] = [];

  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx);
    const val = pair.slice(eqIdx + 1);
    if (key === "t") timestamp = val;
    else if (key === "v1") v1Signatures.push(val);
  }

  if (!timestamp || v1Signatures.length === 0) return false;

  // Reject events older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(signedPayload));
  const computed = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return v1Signatures.some((sig) => sig === computed);
}

export const handleStripeWebhook = httpAction(async (ctx, request) => {
  const rawBody = await request.text();
  const sigHeader = request.headers.get("stripe-signature");

  if (!sigHeader) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET not set");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const isValid = await verifyStripeSignature(rawBody, sigHeader, secret);
  if (!isValid) {
    console.error("[stripe webhook] Signature verification failed");
    return new Response("Invalid signature", { status: 400 });
  }

  let event: { id: string; type: string; data: { object: any } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Idempotency check
  const alreadyProcessed = await ctx.runQuery(internal.billing.wasEventProcessed, {
    stripeEventId: event.id,
  });
  if (alreadyProcessed) {
    console.log(`[stripe webhook] Event ${event.id} already processed`);
    return new Response("OK", { status: 200 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const organizationId = session.metadata?.organizationId;
        const packId = session.metadata?.packId;

        if (!organizationId || !packId) {
          console.error("[stripe webhook] Missing metadata in checkout.session.completed");
          await ctx.runMutation(internal.billing.markEventProcessed, {
            stripeEventId: event.id,
            type: event.type,
          });
          break;
        }

        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? undefined;

        await ctx.runMutation(internal.billing.processCheckoutCompleted, {
          stripeEventId: event.id,
          sessionId: session.id,
          paymentIntentId,
          organizationId,
          packId,
          amountCents: session.amount_total ?? 0,
          currency: session.currency ?? "sgd",
        });
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        console.error(
          `[stripe webhook] Payment failed: ${pi.id}`,
          pi.last_payment_error?.message
        );
        await ctx.runMutation(internal.billing.markEventProcessed, {
          stripeEventId: event.id,
          type: event.type,
        });
        break;
      }

      default:
        await ctx.runMutation(internal.billing.markEventProcessed, {
          stripeEventId: event.id,
          type: event.type,
        });
    }
  } catch (err) {
    console.error(`[stripe webhook] Error handling event ${event.id} (${event.type}):`, err);
    return new Response("Internal error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
});

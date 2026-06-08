import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { transformWebhookData } from "./paymentAttemptTypes";

// Verify Svix webhook signature using Web Crypto API (no Node.js required)
// Svix signs: "{svix-id}.{svix-timestamp}.{body}" with HMAC-SHA256
// Secret format: "whsec_{base64_encoded_secret}"
async function verifySvixSignature(
  payload: string,
  headers: { svixId: string; svixTimestamp: string; svixSignature: string },
  secret: string
): Promise<boolean> {
  // Strip "whsec_" prefix and decode base64 key
  const keyBase64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keyBytes = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));

  const signedContent = `${headers.svixId}.${headers.svixTimestamp}.${payload}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(signedContent));
  const computed = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));

  // svixSignature may contain multiple sigs: "v1,sig1 v1,sig2"
  const signatures = headers.svixSignature.split(" ");
  return signatures.some((sig) => {
    const [version, value] = sig.split(",");
    return version === "v1" && value === computed;
  });
}

export const handleClerkWebhook = httpAction(async (ctx, request) => {
  const payload = await request.text();

  const svixId = request.headers.get("svix-id") ?? "";
  const svixTimestamp = request.headers.get("svix-timestamp") ?? "";
  const svixSignature = request.headers.get("svix-signature") ?? "";

  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[clerk-webhook] Missing CLERK_WEBHOOK_SECRET env var");
    return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const valid = await verifySvixSignature(payload, { svixId, svixTimestamp, svixSignature }, secret);
  if (!valid) {
    console.error("[clerk-webhook] Signature verification failed");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event: { type: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    switch (event.type) {
      case "user.created":
      case "user.updated":
        await ctx.runMutation(api.users.upsertFromClerk, { data: event.data as any });
        break;
      case "user.deleted":
        await ctx.runMutation(api.users.deleteFromClerk, {
          clerkUserId: (event.data.id as string) ?? "",
        });
        break;
      case "paymentAttempt.updated":
        await ctx.runMutation(api.paymentAttempts.savePaymentAttempt, {
          paymentAttemptData: transformWebhookData(event.data as any),
        });
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`[clerk-webhook] Failed to process event "${event.type}":`, err);
    return new Response(JSON.stringify({ error: "Internal error processing webhook" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

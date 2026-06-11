import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
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
      case "user.updated": {
        await ctx.runMutation(api.users.upsertFromClerk, { data: event.data as any });
        // Retry any org memberships that failed because user didn't exist in Convex yet.
        // Clerk may include organization_memberships on user.created when the user
        // accepted an invitation, or organizationMembership.created may have arrived first.
        const userData = event.data as any;
        if (Array.isArray(userData.organization_memberships)) {
          for (const om of userData.organization_memberships) {
            try {
              await ctx.runMutation(internal.memberships.syncFromClerk, {
                clerkOrgId: om.organization.id as string,
                clerkUserId: userData.id as string,
                role: om.role as string,
              });
            } catch (e) {
              console.warn(`[clerk-webhook] Could not sync membership for user ${userData.id as string}:`, e);
            }
          }
        }
        break;
      }
      case "user.deleted":
        await ctx.runMutation(api.users.deleteFromClerk, {
          clerkUserId: (event.data.id as string) ?? "",
        });
        break;
      case "paymentAttempt.updated": {
        const paymentData = event.data as any;
        await ctx.runMutation(api.paymentAttempts.savePaymentAttempt, {
          paymentAttemptData: transformWebhookData(paymentData),
        });
        // Activate org billing when payment succeeds
        if (paymentData.status === "paid" && Array.isArray(paymentData.subscription_items) && paymentData.subscription_items.length > 0) {
          const item = paymentData.subscription_items[0];
          await ctx.runMutation(internal.billing.activateFromPayment, {
            clerkUserId: paymentData.payer.user_id,
            clerkOrgId: paymentData.payer.organization_id ?? undefined,
            planId: item.plan.id,
            periodStart: item.period_start,
            periodEnd: item.period_end,
          });
        }
        break;
      }
      case "organization.created": {
        const orgData = event.data as any;
        await ctx.runMutation(internal.organizations.createFromClerk, {
          clerkOrgId: orgData.id as string,
          name: orgData.name as string,
          slug: (orgData.slug ?? "") as string,
          createdByClerkId: (orgData.created_by ?? "") as string,
        });
        break;
      }
      case "organization.updated": {
        const orgData = event.data as any;
        await ctx.runMutation(internal.organizations.updateFromClerk, {
          clerkOrgId: orgData.id as string,
          name: orgData.name as string,
        });
        break;
      }
      case "organization.deleted": {
        const orgData = event.data as any;
        await ctx.runMutation(internal.organizations.deleteFromClerk, {
          clerkOrgId: (orgData.id ?? "") as string,
        });
        break;
      }
      case "organizationMembership.created":
      case "organizationMembership.updated": {
        const memData = event.data as any;
        await ctx.runMutation(internal.memberships.syncFromClerk, {
          clerkOrgId: memData.organization.id as string,
          clerkUserId: memData.public_user_data.user_id as string,
          role: memData.role as string,
        });
        break;
      }
      case "organizationMembership.deleted": {
        const memData = event.data as any;
        await ctx.runMutation(internal.memberships.removeFromClerk, {
          clerkOrgId: memData.organization.id as string,
          clerkUserId: memData.public_user_data.user_id as string,
        });
        break;
      }
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

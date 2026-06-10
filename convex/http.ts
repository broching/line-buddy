import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { handleLineWebhook } from "./lineWebhook";
import { handleClerkWebhook } from "./clerkWebhook";
import { handleStripeWebhook } from "./stripeWebhook";

const http = httpRouter();

// LINE webhook — single URL for the shared bot, org is resolved from lineGroupId
http.route({
  path: "/webhooks/line",
  method: "POST",
  handler: handleLineWebhook,
});

// LINE verification ping (GET) — responds 200 so the dev console "Verify" button passes
http.route({
  path: "/webhooks/line",
  method: "GET",
  handler: httpAction(async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  ),
});

// Clerk user-sync webhook
http.route({
  path: "/webhooks/clerk",
  method: "POST",
  handler: handleClerkWebhook,
});

// Stripe payment webhook
http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: handleStripeWebhook,
});

export default http;

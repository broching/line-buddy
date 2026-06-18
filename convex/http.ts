import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { handleLineWebhook } from "./lineWebhook";
import { handleWhatsappWebhook } from "./whatsappWebhook";
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

// BYOK LINE webhook — per-org channel, URL: /webhooks/line/{routeToken}
http.route({
  pathPrefix: "/webhooks/line/",
  method: "POST",
  handler: handleLineWebhook,
});

http.route({
  pathPrefix: "/webhooks/line/",
  method: "GET",
  handler: httpAction(async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  ),
});

// WhatsApp (Wasender) webhook — per-session URL: /webhooks/whatsapp/{routeToken}
// The route token identifies the org's session; signature is verified in the handler.
http.route({
  pathPrefix: "/webhooks/whatsapp/",
  method: "POST",
  handler: handleWhatsappWebhook,
});

http.route({
  pathPrefix: "/webhooks/whatsapp/",
  method: "GET",
  handler: httpAction(async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  ),
});

// Managed (shared LeadMighty bot) WhatsApp webhook — single fixed URL, org resolved per group.
http.route({
  path: "/webhooks/whatsapp-managed",
  method: "POST",
  handler: handleWhatsappWebhook,
});

http.route({
  path: "/webhooks/whatsapp-managed",
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

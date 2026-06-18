import { action, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { requireAdmin, requireMembership } from "./lib/auth";
import { encryptSecret, decryptSecret } from "./lib/crypto";
import { getBotInfo, getWebhookEndpoint } from "./lib/lineApi";

const modeValidator = v.union(v.literal("managed"), v.literal("byok"));

function generateRouteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Public query: safe LINE config view for the dashboard ────────────────────

export const getConfig = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);
    const org = await ctx.db.get(organizationId);
    if (!org) return null;
    const siteUrl = process.env.CONVEX_SITE_URL ?? "";
    return {
      mode: (org.lineMode ?? "managed") as "managed" | "byok",
      hasByok: !!org.lineByokAccessToken && !!org.lineByokChannelSecret,
      botName: org.lineByokBotName ?? null,
      webhookUrl: org.lineRouteToken ? `${siteUrl}/webhooks/line/${org.lineRouteToken}` : null,
    };
  },
});

// Internal: encrypted BYOK creds + route token (for the live status action).
export const getCredsInternal = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const org = await ctx.db.get(organizationId);
    return {
      accessTokenEnc: org?.lineByokAccessToken ?? null,
      routeToken: org?.lineRouteToken ?? null,
    };
  },
});

// ─── Internal lookups ─────────────────────────────────────────────────────────

// Resolve a BYOK LINE channel from the webhook route token (returns encrypted creds).
export const getByRouteToken = internalQuery({
  args: { routeToken: v.string() },
  handler: async (ctx, { routeToken }) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("byLineRouteToken", (q) => q.eq("lineRouteToken", routeToken))
      .unique();
    if (!org) return null;
    return {
      organizationId: org._id,
      accessTokenEnc: org.lineByokAccessToken ?? null,
      channelSecretEnc: org.lineByokChannelSecret ?? null,
    };
  },
});

// ─── Mutations / actions ──────────────────────────────────────────────────────

// Ensure the org has a BYOK webhook route token so we can show the webhook URL
// before credentials are entered (the LINE console needs the URL up front).
export const ensureRouteToken = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireAdmin(ctx, organizationId);
    const org = await ctx.db.get(organizationId);
    if (org && !org.lineRouteToken) {
      await ctx.db.patch(organizationId, { lineRouteToken: generateRouteToken() });
    }
  },
});

export const setMode = mutation({
  args: { organizationId: v.id("organizations"), mode: modeValidator },
  handler: async (ctx, { organizationId, mode }) => {
    await requireAdmin(ctx, organizationId);
    if (mode === "byok") {
      const org = await ctx.db.get(organizationId);
      if (!org?.lineByokAccessToken || !org?.lineByokChannelSecret) {
        throw new Error("Add your LINE channel credentials before switching to your own bot");
      }
    }
    await ctx.db.patch(organizationId, { lineMode: mode });
  },
});

// Internal: persist encrypted BYOK credentials (called from the save action).
export const saveCredentials = mutation({
  args: {
    organizationId: v.id("organizations"),
    accessTokenEnc: v.string(),
    channelSecretEnc: v.string(),
    botName: v.string(),
  },
  handler: async (ctx, { organizationId, accessTokenEnc, channelSecretEnc, botName }) => {
    await requireAdmin(ctx, organizationId);
    const org = await ctx.db.get(organizationId);
    const routeToken = org?.lineRouteToken ?? generateRouteToken();
    await ctx.db.patch(organizationId, {
      lineByokAccessToken: accessTokenEnc,
      lineByokChannelSecret: channelSecretEnc,
      lineByokBotName: botName,
      lineRouteToken: routeToken,
      lineMode: "byok",
    });
  },
});

// Encrypts + stores the org's own LINE channel credentials and switches to BYOK.
export const saveByok = action({
  args: {
    organizationId: v.id("organizations"),
    accessToken: v.string(),
    channelSecret: v.string(),
  },
  handler: async (ctx, { organizationId, accessToken, channelSecret }): Promise<{ ok: true; botName: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const at = accessToken.trim();
    const cs = channelSecret.trim();
    if (!at || !cs) throw new Error("Both the channel access token and channel secret are required");

    // Validate against LINE before saving — the access token must resolve to a bot.
    const info = await getBotInfo(at);
    if (!info) {
      throw new Error("LINE rejected that access token. Double-check it's a valid long-lived channel access token.");
    }

    const [accessTokenEnc, channelSecretEnc] = await Promise.all([
      encryptSecret(at),
      encryptSecret(cs),
    ]);
    await ctx.runMutation(api.lineChannels.saveCredentials, {
      organizationId,
      accessTokenEnc,
      channelSecretEnc,
      botName: info.displayName,
    });
    return { ok: true, botName: info.displayName };
  },
});

// Live connection status — validates the stored token against LINE and reports the
// bot name + whether the webhook is configured. Used to show accurate "connected" state.
export const getStatus = action({
  args: { organizationId: v.id("organizations") },
  handler: async (
    ctx,
    { organizationId }
  ): Promise<{
    hasCreds: boolean;
    connected: boolean;
    botName: string | null;
    webhookActive: boolean;
    webhookMatches: boolean;
    expectedWebhookUrl: string | null;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const creds = await ctx.runQuery(internal.lineChannels.getCredsInternal, { organizationId });
    const expectedWebhookUrl = creds.routeToken
      ? `${process.env.CONVEX_SITE_URL ?? ""}/webhooks/line/${creds.routeToken}`
      : null;

    if (!creds.accessTokenEnc) {
      return { hasCreds: false, connected: false, botName: null, webhookActive: false, webhookMatches: false, expectedWebhookUrl };
    }

    let accessToken: string;
    try {
      accessToken = await decryptSecret(creds.accessTokenEnc);
    } catch {
      return { hasCreds: true, connected: false, botName: null, webhookActive: false, webhookMatches: false, expectedWebhookUrl };
    }

    const info = await getBotInfo(accessToken);
    if (!info) {
      return { hasCreds: true, connected: false, botName: null, webhookActive: false, webhookMatches: false, expectedWebhookUrl };
    }

    const wh = await getWebhookEndpoint(accessToken);
    return {
      hasCreds: true,
      connected: true,
      botName: info.displayName,
      webhookActive: wh?.active ?? false,
      webhookMatches: !!(wh?.endpoint && expectedWebhookUrl && wh.endpoint === expectedWebhookUrl),
      expectedWebhookUrl,
    };
  },
});

import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { requireMembership, requireAdmin } from "./lib/auth";
import { writeAuditLog } from "./lib/audit";
import { encryptSecret } from "./lib/crypto";
import {
  createSession,
  getSession,
  connectSession,
  getQrCode,
  disconnectSession,
  deleteSession,
  getGroupMetadata,
  getAllContacts,
} from "./lib/wasenderApi";
import { decryptSecret } from "./lib/crypto";

const statusValidator = v.union(
  v.literal("initializing"),
  v.literal("need_scan"),
  v.literal("connected"),
  v.literal("disconnected"),
);

// ─── Public query: safe session view for the dashboard ────────────────────────

export const getForOrg = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);
    const session = await ctx.db
      .query("whatsappSessions")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .first();
    if (!session) return null;
    // Never expose apiKey / webhookSecret / routeToken to the client.
    return {
      _id: session._id,
      status: session.status,
      phoneNumber: session.phoneNumber ?? null,
      connected: session.status === "connected",
      lastQrAt: session.lastQrAt ?? null,
      connectedAt: session.connectedAt ?? null,
    };
  },
});

// ─── Internal lookups ─────────────────────────────────────────────────────────

export const getByOrgInternal = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    return ctx.db
      .query("whatsappSessions")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .first();
  },
});

// Used by the webhook to resolve + authenticate an inbound event.
export const getByRouteToken = internalQuery({
  args: { routeToken: v.string() },
  handler: async (ctx, { routeToken }) => {
    return ctx.db
      .query("whatsappSessions")
      .withIndex("byRouteToken", (q) => q.eq("routeToken", routeToken))
      .unique();
  },
});

// ─── Internal mutations ───────────────────────────────────────────────────────

// Upsert the session row for an org (admin-gated). Secrets arrive pre-encrypted.
export const saveSession = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    wasenderSessionId: v.string(),
    encryptedApiKey: v.string(),
    encryptedWebhookSecret: v.string(),
    routeToken: v.string(),
    status: statusValidator,
    phoneNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.organizationId);
    const existing = await ctx.db
      .query("whatsappSessions")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", args.organizationId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        wasenderSessionId: args.wasenderSessionId,
        apiKey: args.encryptedApiKey,
        webhookSecret: args.encryptedWebhookSecret,
        routeToken: args.routeToken,
        status: args.status,
        ...(args.phoneNumber ? { phoneNumber: args.phoneNumber } : {}),
      });
      return existing._id;
    }

    const id = await ctx.db.insert("whatsappSessions", {
      organizationId: args.organizationId,
      wasenderSessionId: args.wasenderSessionId,
      apiKey: args.encryptedApiKey,
      webhookSecret: args.encryptedWebhookSecret,
      routeToken: args.routeToken,
      status: args.status,
      phoneNumber: args.phoneNumber,
      createdAt: Date.now(),
    });
    await writeAuditLog(ctx, {
      organizationId: args.organizationId,
      actorType: "user",
      eventType: "whatsappSession.provisioned",
      entityType: "whatsappSession",
      entityId: id,
      payload: { wasenderSessionId: args.wasenderSessionId },
    });
    return id;
  },
});

export const updateStatus = internalMutation({
  args: {
    id: v.id("whatsappSessions"),
    status: statusValidator,
    phoneNumber: v.optional(v.string()),
    setLastQrAt: v.optional(v.boolean()),
    userDisconnected: v.optional(v.boolean()),
    reconnectAttempts: v.optional(v.number()),
  },
  handler: async (ctx, { id, status, phoneNumber, setLastQrAt, userDisconnected, reconnectAttempts }) => {
    const session = await ctx.db.get(id);
    if (!session) return;
    const patch: Record<string, unknown> = { status };
    if (phoneNumber) patch.phoneNumber = phoneNumber;
    if (status === "connected" && !session.connectedAt) patch.connectedAt = Date.now();
    if (status === "connected") patch.reconnectAttempts = 0; // healthy again — reset backoff
    if (setLastQrAt) patch.lastQrAt = Date.now();
    if (userDisconnected !== undefined) patch.userDisconnected = userDisconnected;
    if (reconnectAttempts !== undefined) patch.reconnectAttempts = reconnectAttempts;
    await ctx.db.patch(id, patch);
  },
});

export const getByIdInternal = internalQuery({
  args: { id: v.id("whatsappSessions") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

const MAX_RECONNECT_ATTEMPTS = 5;

// Handles a session.status webhook for a BYO session: auto-reconnects unintentional
// drops (with capped backoff), and surfaces logged-out/expired as needing a re-scan.
export const handleStatusChange = internalMutation({
  args: { id: v.id("whatsappSessions"), rawStatus: v.string() },
  handler: async (ctx, { id, rawStatus }): Promise<{ scheduleReconnectInMs: number | null }> => {
    const session = await ctx.db.get(id);
    if (!session) return { scheduleReconnectInMs: null };
    const s = rawStatus.toLowerCase();

    if (s === "connected") {
      await ctx.db.patch(id, {
        status: "connected",
        reconnectAttempts: 0,
        connectedAt: session.connectedAt ?? Date.now(),
      });
      return { scheduleReconnectInMs: null };
    }
    if (s === "need_scan" || s === "logged_out" || s === "expired") {
      // Auth lost — a fresh QR scan is required; don't loop reconnects.
      await ctx.db.patch(id, { status: "need_scan" });
      return { scheduleReconnectInMs: null };
    }
    if (s === "disconnected") {
      if (session.userDisconnected) {
        await ctx.db.patch(id, { status: "disconnected" });
        return { scheduleReconnectInMs: null };
      }
      const attempts = session.reconnectAttempts ?? 0;
      if (attempts >= MAX_RECONNECT_ATTEMPTS) {
        // Give up auto-reconnecting; let the user re-scan / reconnect manually.
        await ctx.db.patch(id, { status: "need_scan" });
        return { scheduleReconnectInMs: null };
      }
      await ctx.db.patch(id, { status: "initializing", reconnectAttempts: attempts + 1 });
      return { scheduleReconnectInMs: Math.min(3000 + attempts * 5000, 60000) };
    }
    // "connecting" / unknown — leave as-is.
    return { scheduleReconnectInMs: null };
  },
});

// Re-initiates the shared managed session after an unintentional drop. The managed
// session's API key doubles as its session id for the connect endpoint (PAT-authed).
export const reconnectManaged = internalAction({
  args: {},
  handler: async (): Promise<void> => {
    const sid = process.env.WASENDER_MANAGED_API_KEY?.trim();
    if (!sid) {
      console.warn("[whatsappSessions] managed reconnect skipped — WASENDER_MANAGED_API_KEY not set");
      return;
    }
    try {
      const { status } = await connectSession(sid);
      if (status.toUpperCase() === "NEED_SCAN") {
        console.error("[whatsappSessions] managed session needs a QR re-scan in the Wasender dashboard");
      }
    } catch (err) {
      console.error("[whatsappSessions] managed reconnect failed:", err);
    }
  },
});

// Re-initiates the Wasender connection for a session that dropped unintentionally.
export const reconnect = internalAction({
  args: { id: v.id("whatsappSessions") },
  handler: async (ctx, { id }): Promise<void> => {
    const session = await ctx.runQuery(internal.whatsappSessions.getByIdInternal, { id });
    if (!session || session.userDisconnected) return; // user disconnected in the meantime
    try {
      const { status } = await connectSession(session.wasenderSessionId);
      const up = status.toUpperCase();
      // CONNECTED → live; NEED_SCAN → auth lost; otherwise wait for the status webhook.
      await ctx.runMutation(internal.whatsappSessions.updateStatus, {
        id,
        status: up === "CONNECTED" ? "connected" : up === "NEED_SCAN" ? "need_scan" : "initializing",
      });
    } catch (err) {
      console.error("[whatsappSessions] reconnect failed:", err);
      // Leave as initializing; a later status webhook can trigger another attempt.
    }
  },
});

// ─── Public actions (admin-gated via saveSession / runtime auth) ──────────────

// Generate an unguessable token for the per-session webhook URL.
function generateRouteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Create (or reuse) the org's Wasender session. Stores encrypted credentials.
// `phoneNumber` is the number that will be scanned as the bot (Wasender requires it).
export const provision = action({
  args: {
    organizationId: v.id("organizations"),
    phoneNumber: v.string(),
    name: v.optional(v.string()),
    // Recreate the Wasender session even if one already exists (e.g. changing number).
    forceNew: v.optional(v.boolean()),
  },
  handler: async (ctx, { organizationId, phoneNumber, name, forceNew }): Promise<{ status: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const phone = phoneNumber.trim();
    if (!phone) throw new Error("A WhatsApp phone number is required");

    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) throw new Error("CONVEX_SITE_URL not available");

    const existing = await ctx.runQuery(internal.whatsappSessions.getByOrgInternal, {
      organizationId,
    });

    // Reuse the existing Wasender session unless the caller explicitly wants a new
    // one — recreating on every connect would waste paid sessions and break reconnects.
    if (existing && !forceNew) {
      return { status: existing.status };
    }

    // Changing number: free the old Wasender session so its number isn't "taken".
    if (existing?.wasenderSessionId && forceNew) {
      await deleteSession(existing.wasenderSessionId);
    }

    const routeToken = existing?.routeToken ?? generateRouteToken();
    const webhookUrl = `${siteUrl}/webhooks/whatsapp/${routeToken}`;

    // Create a fresh Wasender session (the previous one, if any, is replaced).
    const session = await createSession({
      name: name ?? `Lead Mighty ${organizationId.slice(-6)}`,
      phoneNumber: phone,
      webhookUrl,
    });

    // The create response may omit the webhook secret — fetch full details if so.
    let webhookSecret = session.webhookSecret;
    if (!webhookSecret) {
      try {
        webhookSecret = (await getSession(session.id)).webhookSecret;
      } catch {
        /* best-effort — routing still works via the route token */
      }
    }

    const [encryptedApiKey, encryptedWebhookSecret] = await Promise.all([
      encryptSecret(session.apiKey),
      encryptSecret(webhookSecret ?? ""),
    ]);

    await ctx.runMutation(internal.whatsappSessions.saveSession, {
      organizationId,
      wasenderSessionId: session.id,
      encryptedApiKey,
      encryptedWebhookSecret,
      routeToken,
      status: "initializing",
      phoneNumber: phone,
    });

    return { status: "initializing" };
  },
});

// Start the connection and return a QR string for the dashboard to render.
export const connect = action({
  args: { organizationId: v.id("organizations") },
  handler: async (
    ctx,
    { organizationId }
  ): Promise<{ status: string; qrCode: string | null }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const session = await ctx.runQuery(internal.whatsappSessions.getByOrgInternal, {
      organizationId,
    });
    if (!session) throw new Error("No WhatsApp session — provision one first");

    const { status, qrCode } = await connectSession(session.wasenderSessionId);

    await ctx.runMutation(internal.whatsappSessions.updateStatus, {
      id: session._id,
      status: status.toUpperCase() === "CONNECTED" ? "connected" : "need_scan",
      setLastQrAt: true,
      userDisconnected: false, // user is (re)connecting on purpose
      reconnectAttempts: 0,
    });

    return { status, qrCode };
  },
});

export const refreshQr = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }): Promise<{ qrCode: string | null }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const session = await ctx.runQuery(internal.whatsappSessions.getByOrgInternal, {
      organizationId,
    });
    if (!session) throw new Error("No WhatsApp session");

    const qrCode = await getQrCode(session.wasenderSessionId);
    if (qrCode) {
      await ctx.runMutation(internal.whatsappSessions.updateStatus, {
        id: session._id,
        status: "need_scan",
        setLastQrAt: true,
      });
    }
    return { qrCode };
  },
});

export const disconnect = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const session = await ctx.runQuery(internal.whatsappSessions.getByOrgInternal, {
      organizationId,
    });
    if (!session) return;

    await disconnectSession(session.wasenderSessionId);
    await ctx.runMutation(internal.whatsappSessions.updateStatus, {
      id: session._id,
      status: "disconnected",
      userDisconnected: true, // intentional — don't auto-reconnect
    });
  },
});

// ─── Group member fetch (for project role binding) ───────────────────────────

// Resolves which API key to use for a WhatsApp group + its JID, by the group's agent
// (managed ⇒ env key, byo ⇒ the org's session key). Independent of the active mode.
export const getGroupApiContext = internalQuery({
  args: { groupChatId: v.id("groupChats") },
  handler: async (ctx, { groupChatId }) => {
    const group = await ctx.db.get(groupChatId);
    if (!group || group.channel !== "whatsapp") return null;
    const agent = group.whatsappAgent ?? "byo";
    let byoApiKeyEnc: string | null = null;
    if (agent === "byo") {
      const session = await ctx.db
        .query("whatsappSessions")
        .withIndex("byOrganizationId", (q) => q.eq("organizationId", group.organizationId))
        .first();
      byoApiKeyEnc = session?.apiKey ?? null;
    }
    return { providerGroupId: group.lineGroupId, organizationId: group.organizationId, agent, byoApiKeyEnc };
  },
});

// Fetches the WhatsApp group's participants and stores them as contacts so they can
// be bound to roles when creating a project (the WhatsApp analog of LINE profile sync).
export const fetchGroupMembers = action({
  args: { groupChatId: v.id("groupChats"), organizationId: v.id("organizations") },
  handler: async (ctx, { groupChatId, organizationId }): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const info = await ctx.runQuery(internal.whatsappSessions.getGroupApiContext, { groupChatId });
    if (!info || info.organizationId !== organizationId) return;

    let apiKey: string | undefined;
    if (info.agent === "managed") apiKey = process.env.WASENDER_MANAGED_API_KEY?.trim();
    else if (info.byoApiKeyEnc) {
      try { apiKey = await decryptSecret(info.byoApiKeyEnc); } catch { apiKey = undefined; }
    }
    if (!apiKey) return;

    const meta = await getGroupMetadata(apiKey, info.providerGroupId);
    if (!meta || meta.participants.length === 0) return;

    // Build a phone → display name map from the synced contacts (best-effort).
    const nameByPhone = new Map<string, string>();
    try {
      for (const c of await getAllContacts(apiKey)) {
        const phone = String(c.jid ?? "").split("@")[0].replace(/\D/g, "");
        const name = c.name || c.notify || c.verifiedName;
        if (phone && name) nameByPhone.set(phone, name);
      }
    } catch { /* names are optional */ }

    for (const p of meta.participants.slice(0, 200)) {
      const phone = String(p.jid ?? "").split("@")[0].replace(/\D/g, "");
      if (!phone) continue;
      await ctx.runMutation(api.userLineProfiles.upsertFromWebhook, {
        organizationId,
        channel: "whatsapp",
        lineUserId: phone,
        displayName: nameByPhone.get(phone) ?? phone,
      });
    }
  },
});

// ─── Managed vs BYO mode ──────────────────────────────────────────────────────

const modeValidator = v.union(v.literal("managed"), v.literal("byo"));

// Set the org's WhatsApp delivery mode. Used directly when choosing "bring your
// own number"; the managed switch goes through `selectManaged` (which also tears
// down any BYO session first).
export const setMode = mutation({
  args: { organizationId: v.id("organizations"), mode: modeValidator },
  handler: async (ctx, { organizationId, mode }) => {
    await requireAdmin(ctx, organizationId);
    await ctx.db.patch(organizationId, { whatsappMode: mode });
  },
});

// Returns true (and records it) the first time we should welcome a group — i.e. a
// group the bot just joined that isn't connected yet. Dedupes the join welcome.
export const recordWelcomeIfNew = internalMutation({
  args: { providerGroupId: v.string() },
  handler: async (ctx, { providerGroupId }) => {
    const connected = await ctx.db
      .query("groupChats")
      .withIndex("byLineGroupId", (q) => q.eq("lineGroupId", providerGroupId))
      .unique();
    if (connected) return false;

    const seen = await ctx.db
      .query("whatsappWelcomedGroups")
      .withIndex("byProviderGroupId", (q) => q.eq("providerGroupId", providerGroupId))
      .unique();
    if (seen) return false;

    await ctx.db.insert("whatsappWelcomedGroups", { providerGroupId, welcomedAt: Date.now() });
    return true;
  },
});

// Dev helper: clear all welcome claims (so the join welcome can fire again).
export const clearWelcomes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("whatsappWelcomedGroups").take(1000);
    for (const r of rows) await ctx.db.delete(r._id);
    return rows.length;
  },
});

// Atomically claim an inbound message id. Returns true the first time only —
// Wasender re-delivers the same message under multiple webhook events, and command
// handling (e.g. /connect) runs before storage, so without this the same message
// gets processed twice.
export const claimInboundKey = internalMutation({
  args: { keyId: v.string() },
  handler: async (ctx, { keyId }) => {
    const existing = await ctx.db
      .query("whatsappInboundKeys")
      .withIndex("byKeyId", (q) => q.eq("keyId", keyId))
      .unique();
    if (existing) return false;
    await ctx.db.insert("whatsappInboundKeys", { keyId, at: Date.now() });
    return true;
  },
});

// Prunes old inbound dedup keys (called by a daily cron).
export const cleanupInboundKeys = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const old = await ctx.db
      .query("whatsappInboundKeys")
      .withIndex("byKeyId")
      .filter((q) => q.lt(q.field("at"), cutoff))
      .take(500);
    for (const row of old) await ctx.db.delete(row._id);
  },
});

// Release a welcome claim if the send failed, so it can be retried on the next event.
export const releaseWelcome = internalMutation({
  args: { providerGroupId: v.string() },
  handler: async (ctx, { providerGroupId }) => {
    const row = await ctx.db
      .query("whatsappWelcomedGroups")
      .withIndex("byProviderGroupId", (q) => q.eq("providerGroupId", providerGroupId))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});

export const deleteSessionRow = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const session = await ctx.db
      .query("whatsappSessions")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .first();
    if (session) await ctx.db.delete(session._id);
  },
});

// Switch to the shared LeadMighty managed bot — disconnects & removes any
// bring-your-own-number session so only one mode is ever active.
export const selectManaged = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const session = await ctx.runQuery(internal.whatsappSessions.getByOrgInternal, {
      organizationId,
    });
    if (session?.wasenderSessionId) {
      try {
        await disconnectSession(session.wasenderSessionId);
        await deleteSession(session.wasenderSessionId);
      } catch { /* best-effort */ }
    }
    await ctx.runMutation(internal.whatsappSessions.deleteSessionRow, { organizationId });
    await ctx.runMutation(api.whatsappSessions.setMode, { organizationId, mode: "managed" });
  },
});

// Manual status refresh trigger usable from the dashboard if the webhook is missed.
export const markStatus = mutation({
  args: { organizationId: v.id("organizations"), status: statusValidator },
  handler: async (ctx, { organizationId, status }) => {
    await requireAdmin(ctx, organizationId);
    const session = await ctx.db
      .query("whatsappSessions")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .first();
    if (session) await ctx.db.patch(session._id, { status });
  },
});

// Wasender (WhatsApp) API helpers. Runtime-neutral — only uses fetch(), so this
// file works in both the V8 webhook and the Convex actions.
//
// Two auth contexts:
//   • Personal Access Token (env WASENDER_PAT) — manage sessions (create/connect/QR).
//   • Per-session API key — send messages, decrypt media (stored encrypted per org).

const WASENDER_API = "https://www.wasenderapi.com/api";

const DEFAULT_WEBHOOK_EVENTS = [
  "messages.received",
  "messages-group.received",
  "groups.upsert",
  "group-participants.update",
  "session.status",
];

function pat(): string {
  const token = process.env.WASENDER_PAT?.trim();
  if (!token) throw new Error("WASENDER_PAT is not configured");
  return token;
}

// ─── Session management (Personal Access Token) ───────────────────────────────

export type WasenderSession = {
  id: string;
  apiKey: string;
  webhookSecret: string | null;
  status?: string;
  phoneNumber?: string;
};

// Pulls id / api_key / webhook secret out of Wasender's (slightly inconsistent) shapes.
function parseSession(raw: Record<string, unknown>): WasenderSession {
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const id = data.id ?? data.session_id ?? data.sessionId;
  const apiKey = data.api_key ?? data.apiKey ?? data.key;
  const webhookSecret = data.webhook_secret ?? data.webhookSecret ?? null;
  return {
    id: String(id),
    apiKey: String(apiKey ?? ""),
    webhookSecret: webhookSecret == null ? null : String(webhookSecret),
    status: typeof data.status === "string" ? data.status : undefined,
    phoneNumber:
      typeof data.phone_number === "string"
        ? data.phone_number
        : typeof data.phoneNumber === "string"
          ? (data.phoneNumber as string)
          : undefined,
  };
}

export async function createSession(args: {
  name: string;
  phoneNumber?: string;
  webhookUrl: string;
  events?: string[];
}): Promise<WasenderSession> {
  const res = await fetch(`${WASENDER_API}/whatsapp-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${pat()}` },
    body: JSON.stringify({
      name: args.name,
      phone_number: args.phoneNumber ?? "",
      account_protection: true,
      log_messages: true,
      read_incoming_messages: false,
      webhook_url: args.webhookUrl,
      webhook_enabled: true,
      webhook_events: args.events ?? DEFAULT_WEBHOOK_EVENTS,
    }),
  });
  if (!res.ok) throw new Error(`Wasender createSession failed: ${res.status} ${await res.text()}`);
  return parseSession(await res.json());
}

// Fetch full session details (used to recover the webhook secret / api key if the
// create response omitted them).
export async function getSession(sessionId: string): Promise<WasenderSession> {
  const res = await fetch(`${WASENDER_API}/whatsapp-sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${pat()}` },
  });
  if (!res.ok) throw new Error(`Wasender getSession failed: ${res.status} ${await res.text()}`);
  return parseSession(await res.json());
}

export type ConnectResult = { status: string; qrCode: string | null };

export async function connectSession(sessionId: string): Promise<ConnectResult> {
  const res = await fetch(`${WASENDER_API}/whatsapp-sessions/${sessionId}/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${pat()}` },
  });
  if (!res.ok) throw new Error(`Wasender connectSession failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const data = (json.data ?? json) as Record<string, unknown>;
  return {
    status: String(data.status ?? "NEED_SCAN"),
    qrCode: (data.qrCode ?? data.qrcode ?? null) as string | null,
  };
}

export async function getQrCode(sessionId: string): Promise<string | null> {
  const res = await fetch(`${WASENDER_API}/whatsapp-sessions/${sessionId}/qrcode`, {
    headers: { Authorization: `Bearer ${pat()}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const data = (json.data ?? json) as Record<string, unknown>;
  return (data.qrCode ?? data.qrcode ?? null) as string | null;
}

export async function disconnectSession(sessionId: string): Promise<void> {
  const res = await fetch(`${WASENDER_API}/whatsapp-sessions/${sessionId}/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${pat()}` },
  });
  if (!res.ok) console.error("[Wasender] disconnect failed:", res.status, await res.text());
}

// Permanently deletes a session (frees up the phone number). Best-effort.
export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`${WASENDER_API}/whatsapp-sessions/${sessionId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${pat()}` },
  });
  if (!res.ok) console.error("[Wasender] delete failed:", res.status, await res.text());
}

// ─── Messaging (per-session API key) ──────────────────────────────────────────

export type WaSendOptions = {
  text?: string;
  imageUrl?: string;
  mentions?: string[]; // phone-number JIDs, e.g. "1234567890@s.whatsapp.net"
};

export async function sendGroupMessage(
  apiKey: string,
  to: string,
  opts: WaSendOptions
): Promise<boolean> {
  const body: Record<string, unknown> = { to };
  if (opts.text) body.text = opts.text;
  if (opts.imageUrl) body.imageUrl = opts.imageUrl;
  if (opts.mentions && opts.mentions.length > 0) body.mentions = opts.mentions;

  const res = await fetch(`${WASENDER_API}/send-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error("[Wasender] sendGroupMessage failed:", res.status, await res.text());
  return res.ok;
}

// Decrypts an inbound media object → temporary public URL (valid ~1h).
// `messageData` is the webhook's `data` object for the message.
export async function decryptMedia(
  apiKey: string,
  messageData: unknown
): Promise<string | null> {
  const res = await fetch(`${WASENDER_API}/decrypt-media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ data: messageData }),
  });
  if (!res.ok) {
    console.error("[Wasender] decryptMedia failed:", res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return (json.publicUrl ?? json.data?.publicUrl ?? null) as string | null;
}

export async function getContactPicture(apiKey: string, jid: string): Promise<string | null> {
  const res = await fetch(`${WASENDER_API}/contacts/${encodeURIComponent(jid)}/picture`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return (json.data?.imgUrl ?? json.imgUrl ?? json.url ?? null) as string | null;
}

// ─── Inbound signature ────────────────────────────────────────────────────────

// Wasender's X-Webhook-Signature is the session's plain webhook secret. We treat
// verification as best-effort: routing already relies on an unguessable URL token.
export function verifyWasenderSignature(headerValue: string | null, secret: string | null): boolean {
  if (!secret) return true; // no secret stored → rely on the route token in the URL
  return headerValue?.trim() === secret.trim();
}

// ─── JID helpers ──────────────────────────────────────────────────────────────

// Group JIDs end in "@g.us". A bare phone number becomes "<num>@s.whatsapp.net".
export function phoneToJid(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `${digits}@s.whatsapp.net`;
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}

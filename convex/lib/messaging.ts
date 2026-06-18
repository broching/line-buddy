// Channel-agnostic outbound messaging facade. Every place that pushes a message
// to a group (AI replies, reminders, dashboard send) goes through here so the
// LINE vs WhatsApp split lives in exactly one place.
//
// Runtime-neutral (fetch only) — safe to import from V8 and Node functions.

import { sendGroupMessage as waSend, phoneToJid } from "./wasenderApi";

const LINE_API = "https://api.line.me/v2/bot";

export type Channel = "line" | "whatsapp";

// Credentials needed to send on a given channel. For LINE the access token is the
// shared bot token; for WhatsApp it's the org's per-session (decrypted) API key.
export type SendCreds =
  | { channel: "line"; accessToken: string }
  | { channel: "whatsapp"; apiKey: string };

// A person to @mention. `userId` is the provider user id: a LINE userId, or a
// WhatsApp phone number (digits).
export type Mention = { userId: string; displayName: string };

export type SendOptions = {
  text: string;
  mentions?: Mention[];
  imageUrl?: string;
  // LINE-only: thread the reply to the user's message. Ignored on WhatsApp.
  replyToken?: string;
  quoteToken?: string;
};

// ─── LINE ─────────────────────────────────────────────────────────────────────

function buildLineMessage(opts: SendOptions): Record<string, unknown> {
  if (opts.imageUrl) {
    return { type: "image", originalContentUrl: opts.imageUrl, previewImageUrl: opts.imageUrl };
  }
  if (opts.mentions && opts.mentions.length > 0) {
    const substitution: Record<string, unknown> = {};
    const parts: string[] = [];
    opts.mentions.forEach((m, i) => {
      const key = `mention${i}`;
      substitution[key] = { type: "mention", mentionee: { type: "user", userId: m.userId } };
      parts.push(`{${key}}`);
    });
    return { type: "textV2", text: `${parts.join(" ")}\n${opts.text}`, substitution };
  }
  const message: Record<string, unknown> = { type: "text", text: opts.text };
  if (opts.quoteToken) message.quoteToken = opts.quoteToken;
  return message;
}

async function sendLine(accessToken: string, to: string, opts: SendOptions): Promise<boolean> {
  const message = buildLineMessage(opts);

  // Prefer a threaded reply; fall back to push if the reply token expired (~30s TTL).
  if (opts.replyToken && message.type !== "image") {
    const res = await fetch(`${LINE_API}/message/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ replyToken: opts.replyToken, messages: [message] }),
    });
    if (res.ok) return true;
    console.warn(`[messaging] LINE reply failed (${res.status}), falling back to push: ${await res.text()}`);
  }

  const res = await fetch(`${LINE_API}/message/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ to, messages: [message] }),
  });
  if (!res.ok) console.error("[messaging] LINE push failed:", res.status, await res.text());
  return res.ok;
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

async function sendWhatsApp(apiKey: string, to: string, opts: SendOptions): Promise<boolean> {
  let text = opts.text;
  let mentionJids: string[] | undefined;
  if (opts.mentions && opts.mentions.length > 0) {
    // WhatsApp renders the mention from the @<number> in the text + the JID array.
    const prefix = opts.mentions.map((m) => `@${m.userId.replace(/[^0-9]/g, "")}`).join(" ");
    text = `${prefix}\n${opts.text}`;
    mentionJids = opts.mentions.map((m) => phoneToJid(m.userId));
  }
  return waSend(apiKey, to, { text, mentions: mentionJids, imageUrl: opts.imageUrl });
}

// ─── Facade ───────────────────────────────────────────────────────────────────

export async function sendGroupMessage(
  creds: SendCreds,
  to: string,
  opts: SendOptions
): Promise<boolean> {
  if (creds.channel === "whatsapp") return sendWhatsApp(creds.apiKey, to, opts);
  return sendLine(creds.accessToken, to, opts);
}

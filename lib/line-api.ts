import { createHmac } from "crypto";

const LINE_API = "https://api.line.me/v2/bot";

// ─── Signature verification ───────────────────────────────────────────────────

export function verifyLineSignature(
  body: string,
  channelSecret: string,
  signature: string
): boolean {
  const hash = createHmac("sha256", channelSecret).update(body).digest("base64");
  return hash === signature;
}

// ─── Messaging ────────────────────────────────────────────────────────────────

export async function replyMessage(
  replyToken: string,
  accessToken: string,
  text: string,
  quoteToken?: string
): Promise<void> {
  const message: Record<string, string> = { type: "text", text };
  if (quoteToken) message.quoteToken = quoteToken;
  const res = await fetch(`${LINE_API}/message/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages: [message] }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[LINE] replyMessage failed:", res.status, body);
  }
}

export async function pushMessage(
  to: string,
  accessToken: string,
  text: string,
  quoteToken?: string
): Promise<void> {
  const message: Record<string, string> = { type: "text", text };
  if (quoteToken) message.quoteToken = quoteToken;
  const res = await fetch(`${LINE_API}/message/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to, messages: [message] }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[LINE] pushMessage failed:", res.status, body);
  }
}

// ─── Media download ───────────────────────────────────────────────────────────

export async function getMessageContent(
  messageId: string,
  accessToken: string
): Promise<{ blob: Blob; contentType: string } | null> {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  return { blob, contentType };
}

// ─── Group member profile ─────────────────────────────────────────────────────

export async function getGroupMemberProfile(
  groupId: string,
  userId: string,
  accessToken: string
): Promise<{ displayName: string; pictureUrl?: string } | null> {
  const res = await fetch(`${LINE_API}/group/${groupId}/member/${userId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return { displayName: data.displayName ?? null, pictureUrl: data.pictureUrl };
}

// ─── Group metadata ───────────────────────────────────────────────────────────

export async function getGroupSummary(
  groupId: string,
  accessToken: string
): Promise<{ groupName: string; pictureUrl?: string }> {
  const res = await fetch(`${LINE_API}/group/${groupId}/summary`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    return { groupName: "LINE Group" }; // fallback if API fails
  }
  const data = await res.json();
  return { groupName: data.groupName ?? "LINE Group", pictureUrl: data.pictureUrl };
}

// ─── Bot info (used to test credentials) ─────────────────────────────────────

export async function getBotInfo(accessToken: string): Promise<{ displayName: string } | null> {
  const res = await fetch(`${LINE_API}/info`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// ─── Event types ─────────────────────────────────────────────────────────────

export type LineEvent =
  | LineMessageEvent
  | LineJoinEvent
  | LineLeaveEvent
  | LineMemberJoinEvent
  | LineMemberLeaveEvent;

export interface LineMessageEvent {
  type: "message";
  replyToken: string;
  source: LineSource;
  timestamp: number;
  message: { id: string; type: string; text?: string; quoteToken?: string };
}

export interface LineJoinEvent {
  type: "join";
  replyToken: string;
  source: LineSource;
  timestamp: number;
}

export interface LineLeaveEvent {
  type: "leave";
  source: LineSource;
  timestamp: number;
}

export interface LineMemberJoinEvent {
  type: "memberJoined";
  replyToken: string;
  source: LineSource;
  timestamp: number;
  joined: { members: Array<{ type: string; userId: string }> };
}

export interface LineMemberLeaveEvent {
  type: "memberLeft";
  source: LineSource;
  timestamp: number;
  left: { members: Array<{ type: string; userId: string }> };
}

export interface LineSource {
  type: "group" | "room" | "user";
  groupId?: string;
  roomId?: string;
  userId?: string;
}

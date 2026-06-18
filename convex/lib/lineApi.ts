// LINE Messaging API helpers used by lineWebhook.ts (Convex "use node" action)

const LINE_API = "https://api.line.me/v2/bot";

// Uses Web Crypto API (available in both V8 and Node runtimes)
export async function verifyLineSignature(
  body: string,
  channelSecret: string,
  signature: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));
  return hashBase64 === signature;
}

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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ replyToken, messages: [message] }),
  });
  if (!res.ok) console.error("[LINE] replyMessage failed:", res.status, await res.text());
}

export async function pushMessage(to: string, accessToken: string, text: string): Promise<void> {
  const res = await fetch(`${LINE_API}/message/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) console.error("[LINE] pushMessage failed:", res.status, await res.text());
}

export async function pushMessages(
  to: string,
  accessToken: string,
  messages: Array<{ type: string; text?: string; originalContentUrl?: string; previewImageUrl?: string }>
): Promise<void> {
  const res = await fetch(`${LINE_API}/message/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ to, messages }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push failed: ${res.status} ${body}`);
  }
}

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

export async function leaveGroup(groupId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${LINE_API}/group/${groupId}/leave`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) console.error("[LINE] leaveGroup failed:", res.status, await res.text());
}

export async function getGroupSummary(
  groupId: string,
  accessToken: string
): Promise<{ groupName: string; pictureUrl?: string }> {
  const res = await fetch(`${LINE_API}/group/${groupId}/summary`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { groupName: "LINE Group" };
  const data = await res.json();
  return { groupName: data.groupName ?? "LINE Group", pictureUrl: data.pictureUrl };
}

// Returns all LINE user IDs in a group, handling pagination automatically
export async function getAllGroupMemberIds(
  groupId: string,
  accessToken: string
): Promise<string[]> {
  const memberIds: string[] = [];
  let nextToken: string | undefined;

  do {
    const url = new URL(`https://api.line.me/v2/bot/group/${groupId}/members/ids`);
    if (nextToken) url.searchParams.set("start", nextToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) break;

    const data: { memberIds?: string[]; next?: string } = await res.json();
    if (data.memberIds) memberIds.push(...data.memberIds);
    nextToken = data.next;
  } while (nextToken);

  return memberIds;
}

// Validates a channel access token and returns the bot's profile (null if invalid).
export async function getBotInfo(
  accessToken: string
): Promise<{ displayName: string; basicId?: string; userId?: string; pictureUrl?: string } | null> {
  const res = await fetch(`${LINE_API}/info`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    displayName: data.displayName ?? "LINE bot",
    basicId: data.basicId,
    userId: data.userId,
    pictureUrl: data.pictureUrl,
  };
}

// Returns the webhook endpoint configured on the channel + whether it's active.
export async function getWebhookEndpoint(
  accessToken: string
): Promise<{ endpoint: string | null; active: boolean } | null> {
  const res = await fetch(`${LINE_API}/channel/webhook/endpoint`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return { endpoint: data.endpoint ?? null, active: !!data.active };
}

// Returns Uint8Array instead of Buffer — compatible with both V8 and Node runtimes
export async function getMessageContent(
  messageId: string,
  accessToken: string
): Promise<{ data: Uint8Array; contentType: string } | null> {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const arrayBuffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  return { data: new Uint8Array(arrayBuffer), contentType };
}

// ─── Event types ─────────────────────────────────────────────────────────────

export interface LineSource {
  type: "group" | "room" | "user";
  groupId?: string;
  roomId?: string;
  userId?: string;
}

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

export type LineEvent = LineMessageEvent | LineJoinEvent | LineLeaveEvent | Record<string, unknown>;

// Resolves how to send to a group regardless of channel. Two halves:
//   • buildChannelSendInfo — query-safe (no decryption / randomness). Returns the
//     channel + provider group id + raw credentials (LINE token, encrypted WA key).
//   • resolveSendCreds — action-side. Decrypts the WhatsApp key into SendCreds.
//
// This split exists because the Convex query runtime should not run crypto.subtle;
// decryption happens in the action that actually sends.

import { QueryCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { decryptSecret } from "./crypto";
import type { SendCreds } from "./messaging";

export type ChannelSendInfo = {
  channel: "line" | "whatsapp";
  providerGroupId: string;
  lineAccessToken: string | null;     // LINE managed: env token (plaintext, ready to use)
  lineAccessTokenEnc: string | null;  // LINE BYOK: org's encrypted access token
  whatsappApiKeyEnc: string | null;
  whatsappManaged: boolean; // true ⇒ use the shared LeadMighty WhatsApp bot (env creds)
};

export async function buildChannelSendInfo(
  ctx: QueryCtx,
  group: Doc<"groupChats">
): Promise<ChannelSendInfo> {
  const channel = group.channel ?? "line";

  const base = { channel, providerGroupId: group.lineGroupId } as const;
  const empty = {
    ...base,
    lineAccessToken: null,
    lineAccessTokenEnc: null,
    whatsappApiKeyEnc: null,
    whatsappManaged: false,
  };

  if (channel === "whatsapp") {
    const org = await ctx.db.get(group.organizationId);
    const agent = group.whatsappAgent ?? "byo";
    // Both managed and BYO groups coexist, but only the org's selected mode is live.
    if ((org?.whatsappMode ?? "byo") !== agent) return empty;
    if (agent === "managed") {
      return { ...empty, whatsappManaged: true }; // env creds, resolved in resolveSendCreds
    }
    const session = await ctx.db
      .query("whatsappSessions")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", group.organizationId))
      .first();
    const usable = session && session.status === "connected" ? session.apiKey : null;
    return { ...empty, whatsappApiKeyEnc: usable ?? null };
  }

  // ── LINE ──
  const org = await ctx.db.get(group.organizationId);
  const agent = group.lineAgent ?? "managed";
  if ((org?.lineMode ?? "managed") !== agent) return empty;
  if (agent === "byok") {
    return { ...empty, lineAccessTokenEnc: org?.lineByokAccessToken ?? null };
  }
  // Managed shared LINE bot — env token.
  return { ...empty, lineAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || null };
}

// Action-side: turn the raw info into ready-to-use SendCreds (decrypting if WA BYO).
export async function resolveSendCreds(info: ChannelSendInfo): Promise<SendCreds | null> {
  if (info.channel === "whatsapp") {
    if (info.whatsappManaged) {
      const apiKey = process.env.WASENDER_MANAGED_API_KEY?.trim();
      return apiKey ? { channel: "whatsapp", apiKey } : null;
    }
    if (!info.whatsappApiKeyEnc) return null;
    try {
      return { channel: "whatsapp", apiKey: await decryptSecret(info.whatsappApiKeyEnc) };
    } catch {
      return null;
    }
  }
  // LINE: managed env token is ready-to-use; BYOK token is decrypted here.
  if (info.lineAccessToken) return { channel: "line", accessToken: info.lineAccessToken };
  if (info.lineAccessTokenEnc) {
    try {
      return { channel: "line", accessToken: await decryptSecret(info.lineAccessTokenEnc) };
    } catch {
      return null;
    }
  }
  return null;
}

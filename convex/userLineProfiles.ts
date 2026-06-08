import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { internal } from "./_generated/api";
import { getAllGroupMemberIds, getGroupMemberProfile } from "./lib/lineApi";

// Called from the LINE webhook handler — stores/updates a sender's LINE profile.
export const upsertFromWebhook = mutation({
  args: {
    organizationId: v.id("organizations"),
    lineUserId: v.string(),
    displayName: v.string(),
    pictureUrl: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, lineUserId, displayName, pictureUrl }) => {
    const existing = await ctx.db
      .query("userLineProfiles")
      .withIndex("byOrganizationAndLineUserId", (q) =>
        q.eq("organizationId", organizationId).eq("lineUserId", lineUserId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { displayName, pictureUrl, lastSeenAt: Date.now() });
    } else {
      await ctx.db.insert("userLineProfiles", {
        organizationId,
        lineUserId,
        displayName,
        pictureUrl,
        lastSeenAt: Date.now(),
      });
    }
  },
});

// Internal upsert — called from actions.
export const upsertDirect = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    lineUserId: v.string(),
    displayName: v.string(),
    pictureUrl: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, lineUserId, displayName, pictureUrl }) => {
    const existing = await ctx.db
      .query("userLineProfiles")
      .withIndex("byOrganizationAndLineUserId", (q) =>
        q.eq("organizationId", organizationId).eq("lineUserId", lineUserId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { displayName, pictureUrl, lastSeenAt: Date.now() });
    } else {
      await ctx.db.insert("userLineProfiles", {
        organizationId,
        lineUserId,
        displayName,
        pictureUrl,
        lastSeenAt: Date.now(),
      });
    }
  },
});

// Returns the lineGroupId for a group — used by actions that need it without full auth.
export const getGroupLineId = internalQuery({
  args: { groupChatId: v.id("groupChats") },
  handler: async (ctx, { groupChatId }) => {
    const group = await ctx.db.get(groupChatId);
    if (!group) return null;
    return { lineGroupId: group.lineGroupId, organizationId: group.organizationId };
  },
});

// Returns user IDs seen in messages that are missing profiles — for targeted refresh.
export const getMissingProfileUserIds = internalQuery({
  args: { groupChatId: v.id("groupChats"), organizationId: v.id("organizations") },
  handler: async (ctx, { groupChatId, organizationId }) => {
    const group = await ctx.db.get(groupChatId);
    if (!group || group.organizationId !== organizationId) return null;

    const msgs = await ctx.db
      .query("messages")
      .withIndex("byGroupChatId", (q) => q.eq("groupChatId", groupChatId))
      .order("desc")
      .take(500);

    const seen = new Set<string>();
    for (const m of msgs) {
      if (m.lineUserId !== "system:dashboard" && m.lineUserId !== "unknown" && !m.lineUserId.startsWith("system:")) {
        seen.add(m.lineUserId);
      }
    }

    const missingUserIds: string[] = [];
    for (const lineUserId of seen) {
      const profile = await ctx.db
        .query("userLineProfiles")
        .withIndex("byOrganizationAndLineUserId", (q) =>
          q.eq("organizationId", organizationId).eq("lineUserId", lineUserId)
        )
        .unique();
      if (!profile || !profile.displayName || profile.displayName.startsWith("User …")) {
        missingUserIds.push(lineUserId);
      }
    }

    return { lineGroupId: group.lineGroupId, missingUserIds };
  },
});

// Fetches all member profiles for a LINE group using the bot's shared credentials.
// Called from lineWebhook after /connect and from the client when role tab opens.
export const fetchAllGroupMembersInternal = internalAction({
  args: {
    lineGroupId: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { lineGroupId, organizationId }) => {
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
    if (!accessToken) return;

    let memberIds: string[];
    try {
      memberIds = await getAllGroupMemberIds(lineGroupId, accessToken);
    } catch {
      return;
    }

    for (const lineUserId of memberIds.slice(0, 100)) {
      try {
        const profile = await getGroupMemberProfile(lineGroupId, lineUserId, accessToken);
        if (!profile?.displayName) continue;
        await ctx.runMutation(internal.userLineProfiles.upsertDirect, {
          organizationId,
          lineUserId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl ?? undefined,
        });
      } catch {
        // Skip silently — individual profile fetch failure shouldn't block others
      }
    }
  },
});

// Client-callable version — requires authenticated user.
export const fetchAllGroupMembers = action({
  args: {
    groupChatId: v.id("groupChats"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { groupChatId, organizationId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const info = await ctx.runQuery(internal.userLineProfiles.getGroupLineId, { groupChatId });
    if (!info || info.organizationId !== organizationId) return;
    await ctx.runAction(internal.userLineProfiles.fetchAllGroupMembersInternal, {
      lineGroupId: info.lineGroupId,
      organizationId,
    });
  },
});

// Fetches LINE display names for message senders who lack a stored profile.
// Called from the group detail page on mount.
export const refreshGroupProfiles = action({
  args: {
    groupChatId: v.id("groupChats"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { groupChatId, organizationId }) => {
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
    if (!accessToken) return;

    const data = await ctx.runQuery(internal.userLineProfiles.getMissingProfileUserIds, {
      groupChatId,
      organizationId,
    });
    if (!data || data.missingUserIds.length === 0) return;

    const { lineGroupId, missingUserIds } = data;

    for (const lineUserId of missingUserIds.slice(0, 30)) {
      try {
        const profile = await getGroupMemberProfile(lineGroupId, lineUserId, accessToken);
        if (!profile?.displayName) continue;
        await ctx.runMutation(internal.userLineProfiles.upsertDirect, {
          organizationId,
          lineUserId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl ?? undefined,
        });
      } catch {
        // Skip silently
      }
    }
  },
});

// Returns all known LINE user profiles for the org.
// Since profiles are fetched proactively for all group members, this covers
// everyone in any connected group — suitable for role assignment dropdowns.
export const listByGroup = query({
  args: {
    groupChatId: v.id("groupChats"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { groupChatId, organizationId }) => {
    await requireMembership(ctx, organizationId);

    const profiles = await ctx.db
      .query("userLineProfiles")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(100);

    return profiles.map((p) => ({
      lineUserId: p.lineUserId,
      displayName: p.displayName,
      pictureUrl: p.pictureUrl ?? null,
    }));
  },
});

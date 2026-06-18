import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, requireMembership, computeOrgRole } from "./lib/auth";
import { writeAuditLog } from "./lib/audit";
import { internal } from "./_generated/api";

// Default teams and their roles seeded on every new org
const DEFAULT_TEAMS = [
  {
    name: "Deye Team",
    description: "Internal company team",
    isDefault: true,
    roles: [
      { name: "Owner", description: "Project owner and decision maker", isDefault: false },
      { name: "Business Analyst", description: "Requirements and analysis", isDefault: false },
      { name: "Designer", description: "Design and UX", isDefault: false },
      { name: "Engineer", description: "Technical implementation", isDefault: true },
      { name: "Project Manager", description: "Project coordination", isDefault: false },
    ],
  },
  {
    name: "Customer Team",
    description: "Client or customer team",
    isDefault: true,
    roles: [
      { name: "Decision Maker", description: "Customer decision maker", isDefault: false },
      { name: "Technical Contact", description: "Customer technical contact", isDefault: false },
      { name: "Site Contact", description: "On-site contact", isDefault: true },
    ],
  },
];

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = await requireUser(ctx);

    const baseSlug = toSlug(name) || "org";
    let slug = baseSlug;
    let attempt = 0;
    while (true) {
      const existing = await ctx.db
        .query("organizations")
        .withIndex("bySlug", (q) => q.eq("slug", slug))
        .unique();
      if (!existing) break;
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    const orgId = await ctx.db.insert("organizations", {
      name,
      slug,
      ownerId: user._id,
      planId: "free",
      isActive: true,
      createdAt: Date.now(),
    });

    // Seed default teams and their roles
    for (const teamDef of DEFAULT_TEAMS) {
      const teamId = await ctx.db.insert("teams", {
        organizationId: orgId,
        name: teamDef.name,
        description: teamDef.description,
        isDefault: teamDef.isDefault,
      });
      for (const roleDef of teamDef.roles) {
        await ctx.db.insert("roles", {
          organizationId: orgId,
          teamId,
          name: roleDef.name,
          description: roleDef.description,
          isDefault: roleDef.isDefault,
        });
      }
    }

    // Add creator as owner
    await ctx.db.insert("memberships", {
      organizationId: orgId,
      userId: user._id,
      orgRole: "owner",
      isAdmin: true,
      invitedBy: user._id,
      joinedAt: Date.now(),
      isActive: true,
    });

    await writeAuditLog(ctx, {
      organizationId: orgId,
      actorId: user._id,
      actorType: "user",
      eventType: "organization.created",
      entityType: "organization",
      entityId: orgId,
      payload: { name, slug },
    });

    // Initialise a free billing record for this org
    await ctx.runMutation(internal.billing.initFreeForOrg, { organizationId: orgId, userId: user._id });

    return { orgId, slug };
  },
});

// Internal: the org's selected WhatsApp delivery mode (defaults to "byo").
export const getWhatsappModeInternal = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const org = await ctx.db.get(organizationId);
    return (org?.whatsappMode ?? "byo") as "managed" | "byo";
  },
});

// Internal: the org's selected LINE delivery mode (defaults to "managed").
export const getLineModeInternal = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const org = await ctx.db.get(organizationId);
    return (org?.lineMode ?? "managed") as "managed" | "byok";
  },
});

export const get = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("bySlug", (q) => q.eq("slug", slug))
      .unique();
    if (!org) return null;

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("byExternalId", (q) => q.eq("externalId", identity.subject))
      .unique();
    if (!user) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clerkOrgId = (identity as any)?.org_id as string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clerkOrgRole = (identity as any)?.org_role as string | undefined;

    const membership = await ctx.db
      .query("memberships")
      .withIndex("byOrgAndUser", (q) =>
        q.eq("organizationId", org._id).eq("userId", user._id)
      )
      .unique();

    const profileImageUrl = org.profileImageStorageId
      ? await ctx.storage.getUrl(org.profileImageStorageId)
      : null;

    if (membership?.isActive) {
      const myRole = computeOrgRole(membership, org.ownerId);
      return { ...org, profileImageUrl, myRole };
    }

    // Allow access during webhook race condition: Clerk org context matches
    if (clerkOrgId && org.clerkOrgId === clerkOrgId) {
      const myRole: "owner" | "admin" | "member" =
        user._id === org.ownerId ? "owner" : clerkOrgRole === "org:admin" ? "admin" : "member";
      return { ...org, profileImageUrl, myRole };
    }

    return null;
  },
});

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("byExternalId", (q) => q.eq("externalId", identity.subject))
      .unique();
    if (!user) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clerkOrgId = (identity as any)?.org_id as string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clerkOrgRole = (identity as any)?.org_role as string | undefined;

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("byUserId", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const orgItems = await Promise.all(
      memberships.map(async (m) => {
        const org = await ctx.db.get(m.organizationId);
        if (!org) return null;
        const profileImageUrl = org.profileImageStorageId
          ? await ctx.storage.getUrl(org.profileImageStorageId)
          : null;
        const myRole = computeOrgRole(m, org.ownerId);
        return { ...org, profileImageUrl, myRole };
      })
    );

    const list = orgItems.filter((r): r is NonNullable<typeof r> => r !== null);

    // JWT fallback: include the active Clerk org even when no Convex membership exists yet.
    // This covers the webhook race condition where organizationMembership.created arrived
    // before user.created, causing syncFromClerk to silently skip the membership.
    if (clerkOrgId && !list.some((o) => o.clerkOrgId === clerkOrgId)) {
      const org = await ctx.db
        .query("organizations")
        .withIndex("byClerkOrgId", (q) => q.eq("clerkOrgId", clerkOrgId))
        .unique();
      if (org) {
        const profileImageUrl = org.profileImageStorageId
          ? await ctx.storage.getUrl(org.profileImageStorageId)
          : null;
        const myRole: "owner" | "admin" | "member" =
          user._id === org.ownerId ? "owner" : clerkOrgRole === "org:admin" ? "admin" : "member";
        list.push({ ...org, profileImageUrl, myRole });
      }
    }

    return list;
  },
});

// Internal lookup by ID — used by the LINE webhook HTTP action.
export const getById = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const org = await ctx.db.get(organizationId);
    if (!org || !org.isActive) return null;
    return org;
  },
});

// Returns LINE credentials for a given org ID.
export const getLineConfig = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const org = await ctx.db.get(organizationId);
    if (!org || !org.isActive) return null;
    return {
      name: org.name,
      lineChannelSecret: org.lineChannelSecret ?? null,
      lineChannelAccessToken: org.lineChannelAccessToken ?? null,
    };
  },
});

export const updateLineCredentials = mutation({
  args: {
    organizationId: v.id("organizations"),
    lineChannelAccessToken: v.string(),
    lineChannelSecret: v.string(),
  },
  handler: async (ctx, { organizationId, lineChannelAccessToken, lineChannelSecret }) => {
    const { user, membership } = await requireMembership(ctx, organizationId);
    if (membership.isAdmin === false && membership.orgRole === "member") throw new Error("Admin access required");
    await ctx.db.patch(organizationId, {
      lineChannelAccessToken: lineChannelAccessToken.trim(),
      lineChannelSecret: lineChannelSecret.trim(),
    });
    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "organization.lineCredentialsUpdated",
      entityType: "organization",
      entityId: organizationId,
      payload: {},
    });
  },
});

export const update = mutation({
  args: { organizationId: v.id("organizations"), name: v.string() },
  handler: async (ctx, { organizationId, name }) => {
    const { user } = await requireMembership(ctx, organizationId);
    await ctx.db.patch(organizationId, { name });
    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "organization.updated",
      entityType: "organization",
      entityId: organizationId,
      payload: { name },
    });
  },
});

export const generateUploadUrl = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateProfileImage = mutation({
  args: {
    organizationId: v.id("organizations"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { organizationId, storageId }) => {
    const { user } = await requireMembership(ctx, organizationId);
    await ctx.db.patch(organizationId, { profileImageStorageId: storageId });
    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "organization.profileImageUpdated",
      entityType: "organization",
      entityId: organizationId,
      payload: {},
    });
  },
});

export const removeProfileImage = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const org = await ctx.db.get(organizationId);
    if (org?.profileImageStorageId) {
      await ctx.storage.delete(org.profileImageStorageId);
    }
    await ctx.db.patch(organizationId, { profileImageStorageId: undefined });
    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "organization.profileImageRemoved",
      entityType: "organization",
      entityId: organizationId,
      payload: {},
    });
  },
});

// ─── Internal: Clerk Organization sync ───────────────────────────────────────

export const createFromClerk = internalMutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.string(),
    createdByClerkId: v.string(),
  },
  handler: async (ctx, { clerkOrgId, name, slug, createdByClerkId }) => {
    // Idempotency: skip if already exists
    const existing = await ctx.db
      .query("organizations")
      .withIndex("byClerkOrgId", (q) => q.eq("clerkOrgId", clerkOrgId))
      .unique();
    if (existing) return existing._id;

    const creator = await ctx.db
      .query("users")
      .withIndex("byExternalId", (q) => q.eq("externalId", createdByClerkId))
      .unique();
    if (!creator) {
      console.warn(`[org.createFromClerk] Creator not found for Clerk user ${createdByClerkId}`);
      return null;
    }

    // Ensure slug uniqueness
    let finalSlug = toSlug(slug) || toSlug(name) || "org";
    let attempt = 0;
    while (true) {
      const taken = await ctx.db
        .query("organizations")
        .withIndex("bySlug", (q) => q.eq("slug", finalSlug))
        .unique();
      if (!taken) break;
      attempt += 1;
      finalSlug = `${toSlug(slug) || "org"}-${attempt}`;
    }

    const orgId = await ctx.db.insert("organizations", {
      name,
      slug: finalSlug,
      ownerId: creator._id,
      clerkOrgId,
      planId: "free",
      isActive: true,
      createdAt: Date.now(),
    });

    for (const teamDef of DEFAULT_TEAMS) {
      const teamId = await ctx.db.insert("teams", {
        organizationId: orgId,
        name: teamDef.name,
        description: teamDef.description,
        isDefault: teamDef.isDefault,
      });
      for (const roleDef of teamDef.roles) {
        await ctx.db.insert("roles", {
          organizationId: orgId,
          teamId,
          name: roleDef.name,
          description: roleDef.description,
          isDefault: roleDef.isDefault,
        });
      }
    }

    await ctx.runMutation(internal.billing.initFreeForOrg, { organizationId: orgId, userId: creator._id });

    await writeAuditLog(ctx, {
      organizationId: orgId,
      actorId: creator._id,
      actorType: "system",
      eventType: "organization.created",
      entityType: "organization",
      entityId: orgId,
      payload: { name, slug: finalSlug, clerkOrgId },
    });

    return orgId;
  },
});

export const updateFromClerk = internalMutation({
  args: { clerkOrgId: v.string(), name: v.string() },
  handler: async (ctx, { clerkOrgId, name }) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("byClerkOrgId", (q) => q.eq("clerkOrgId", clerkOrgId))
      .unique();
    if (!org) return;
    await ctx.db.patch(org._id, { name });
  },
});

export const deleteFromClerk = internalMutation({
  args: { clerkOrgId: v.string() },
  handler: async (ctx, { clerkOrgId }) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("byClerkOrgId", (q) => q.eq("clerkOrgId", clerkOrgId))
      .unique();
    if (!org) return;
    await ctx.db.patch(org._id, { isActive: false });
  },
});

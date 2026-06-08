import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, requireMembership } from "./lib/auth";
import { writeAuditLog } from "./lib/audit";

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

    // Add creator as admin member
    await ctx.db.insert("memberships", {
      organizationId: orgId,
      userId: user._id,
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

    return { orgId, slug };
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

    const membership = await ctx.db
      .query("memberships")
      .withIndex("byOrgAndUser", (q) =>
        q.eq("organizationId", org._id).eq("userId", user._id)
      )
      .unique();
    if (!membership?.isActive) return null;

    return org;
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

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("byUserId", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const orgs = await Promise.all(memberships.map((m) => ctx.db.get(m.organizationId)));
    return orgs.filter(Boolean);
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
// Called from the LINE webhook (public, no user auth) to verify request signatures.
// The orgId in the webhook URL is an opaque Convex ID, limiting exposure.
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
    if (membership.isAdmin === false) throw new Error("Admin access required");
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

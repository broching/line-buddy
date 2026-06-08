import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, requireMembership } from "./lib/auth";
import { writeAuditLog } from "./lib/audit";

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);
    return ctx.db
      .query("workflowTemplates")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();
  },
});

export const get = query({
  args: { templateId: v.id("workflowTemplates"), organizationId: v.id("organizations") },
  handler: async (ctx, { templateId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    const template = await ctx.db.get(templateId);
    if (!template || template.organizationId !== organizationId) return null;
    const stages = await ctx.db
      .query("workflowStageTemplates")
      .withIndex("byTemplateId", (q) => q.eq("templateId", templateId))
      .collect();
    stages.sort((a, b) => a.order - b.order);
    return { ...template, stages };
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    teamIds: v.optional(v.array(v.id("teams"))),
  },
  handler: async (ctx, { organizationId, name, description, teamIds }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const now = Date.now();
    const templateId = await ctx.db.insert("workflowTemplates", {
      organizationId,
      name,
      description,
      teamIds: teamIds && teamIds.length > 0 ? teamIds : undefined,
      isArchived: false,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "template.created",
      entityType: "workflowTemplate",
      entityId: templateId,
      payload: { name },
    });
    return templateId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("workflowTemplates"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    teamIds: v.optional(v.array(v.id("teams"))),
  },
  handler: async (ctx, { organizationId, templateId, name, description, teamIds }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const template = await ctx.db.get(templateId);
    if (!template || template.organizationId !== organizationId) throw new Error("Template not found");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (teamIds !== undefined) patch.teamIds = teamIds.length > 0 ? teamIds : undefined;
    await ctx.db.patch(templateId, patch as any);
    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "template.updated",
      entityType: "workflowTemplate",
      entityId: templateId,
      payload: patch,
    });
  },
});

export const duplicate = mutation({
  args: { organizationId: v.id("organizations"), templateId: v.id("workflowTemplates") },
  handler: async (ctx, { organizationId, templateId }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const source = await ctx.db.get(templateId);
    if (!source || source.organizationId !== organizationId) throw new Error("Template not found");

    const now = Date.now();
    const newId = await ctx.db.insert("workflowTemplates", {
      organizationId,
      name: `Copy of ${source.name}`,
      description: source.description,
      teamIds: source.teamIds,
      isArchived: false,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    const stages = await ctx.db
      .query("workflowStageTemplates")
      .withIndex("byTemplateId", (q) => q.eq("templateId", templateId))
      .collect();
    stages.sort((a, b) => a.order - b.order);

    for (const stage of stages) {
      const { _id, _creationTime, templateId: _tid, ...rest } = stage;
      await ctx.db.insert("workflowStageTemplates", { ...rest, templateId: newId });
    }

    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "template.created",
      entityType: "workflowTemplate",
      entityId: newId,
      payload: { name: `Copy of ${source.name}`, duplicatedFrom: templateId },
    });

    return newId;
  },
});

export const archive = mutation({
  args: { organizationId: v.id("organizations"), templateId: v.id("workflowTemplates") },
  handler: async (ctx, { organizationId, templateId }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const template = await ctx.db.get(templateId);
    if (!template || template.organizationId !== organizationId) throw new Error("Template not found");
    await ctx.db.patch(templateId, { isArchived: true, updatedAt: Date.now() });
    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "template.archived",
      entityType: "workflowTemplate",
      entityId: templateId,
      payload: {},
    });
  },
});

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { writeAuditLog } from "./lib/audit";

const requiredFieldValidator = v.object({
  key: v.string(),
  label: v.string(),
  type: v.union(
    v.literal("text"),
    v.literal("number"),
    v.literal("date"),
    v.literal("select"),
    v.literal("file")
  ),
  options: v.optional(v.array(v.string())),
  isRequired: v.boolean(),
  instructions: v.optional(v.string()),
  examples: v.optional(v.array(v.string())),
  responsibleRoleIds: v.optional(v.array(v.id("roles"))),
  reminderDelayMs: v.optional(v.number()),
  reminderMessage: v.optional(v.string()),
  maxReminderCount: v.optional(v.number()),
});

const stageActionValidator = v.object({
  id: v.string(),
  type: v.union(v.literal("group_message"), v.literal("pm_message")),
  message: v.string(),
  roleIds: v.array(v.id("roles")),
});

// Single stage lookup — used by webhook /status command and dashboard
export const getById = query({
  args: { stageId: v.id("workflowStageTemplates"), organizationId: v.id("organizations") },
  handler: async (ctx, { stageId, organizationId }) => {
    const stage = await ctx.db.get(stageId);
    if (!stage || stage.organizationId !== organizationId) return null;
    return stage;
  },
});

export const listByTemplate = query({
  args: { templateId: v.id("workflowTemplates"), organizationId: v.id("organizations") },
  handler: async (ctx, { templateId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    const stages = await ctx.db
      .query("workflowStageTemplates")
      .withIndex("byTemplateId", (q) => q.eq("templateId", templateId))
      .collect();
    return stages.sort((a, b) => a.order - b.order);
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("workflowTemplates"),
    name: v.string(),
  },
  handler: async (ctx, { organizationId, templateId, name }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const template = await ctx.db.get(templateId);
    if (!template || template.organizationId !== organizationId) throw new Error("Template not found");

    // Place new stage at end
    const existing = await ctx.db
      .query("workflowStageTemplates")
      .withIndex("byTemplateId", (q) => q.eq("templateId", templateId))
      .collect();
    const maxOrder = existing.reduce((max, s) => Math.max(max, s.order), 0);

    const stageId = await ctx.db.insert("workflowStageTemplates", {
      templateId,
      organizationId,
      order: maxOrder + 1,
      name,
      description: undefined,
      requiredFields: [],
      responsibleRoleId: undefined,
      reminderDelayMs: 0,
      completionRule: "all_required_fields",
      skipCondition: undefined,
    });

    await ctx.db.patch(templateId, { updatedAt: Date.now() });

    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "stage.created",
      entityType: "workflowStageTemplate",
      entityId: stageId,
      payload: { name, templateId },
    });

    return stageId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    stageId: v.id("workflowStageTemplates"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    requiredFields: v.optional(v.array(requiredFieldValidator)),
    responsibleRoleId: v.optional(v.id("roles")),
    reminderDelayMs: v.optional(v.number()),
    completionRule: v.optional(
      v.union(v.literal("all_required_fields"), v.literal("manual"), v.literal("custom"))
    ),
    skipCondition: v.optional(v.string()),
    stageActions: v.optional(v.array(stageActionValidator)),
  },
  handler: async (ctx, { organizationId, stageId, ...fields }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const stage = await ctx.db.get(stageId);
    if (!stage || stage.organizationId !== organizationId) throw new Error("Stage not found");

    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(stageId, patch as any);
    await ctx.db.patch(stage.templateId, { updatedAt: Date.now() });
  },
});

// Clears the responsible role (sets to null/undefined)
export const clearResponsibleRole = mutation({
  args: { organizationId: v.id("organizations"), stageId: v.id("workflowStageTemplates") },
  handler: async (ctx, { organizationId, stageId }) => {
    await requireMembership(ctx, organizationId);
    const stage = await ctx.db.get(stageId);
    if (!stage || stage.organizationId !== organizationId) throw new Error("Stage not found");
    await ctx.db.patch(stageId, { responsibleRoleId: undefined });
  },
});

export const remove = mutation({
  args: { organizationId: v.id("organizations"), stageId: v.id("workflowStageTemplates") },
  handler: async (ctx, { organizationId, stageId }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const stage = await ctx.db.get(stageId);
    if (!stage || stage.organizationId !== organizationId) throw new Error("Stage not found");
    await ctx.db.delete(stageId);

    // Re-number remaining stages to keep order contiguous
    const remaining = await ctx.db
      .query("workflowStageTemplates")
      .withIndex("byTemplateId", (q) => q.eq("templateId", stage.templateId))
      .collect();
    remaining.sort((a, b) => a.order - b.order);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i + 1) {
        await ctx.db.patch(remaining[i]._id, { order: i + 1 });
      }
    }

    await ctx.db.patch(stage.templateId, { updatedAt: Date.now() });

    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "stage.deleted",
      entityType: "workflowStageTemplate",
      entityId: stageId,
      payload: { name: stage.name },
    });
  },
});

// Receives the full ordered list of stage IDs and updates their order fields
export const reorder = mutation({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("workflowTemplates"),
    orderedStageIds: v.array(v.id("workflowStageTemplates")),
  },
  handler: async (ctx, { organizationId, templateId, orderedStageIds }) => {
    await requireMembership(ctx, organizationId);
    for (let i = 0; i < orderedStageIds.length; i++) {
      const stage = await ctx.db.get(orderedStageIds[i]);
      if (!stage || stage.organizationId !== organizationId || stage.templateId !== templateId) {
        throw new Error("Invalid stage in reorder list");
      }
      await ctx.db.patch(orderedStageIds[i], { order: i + 1 });
    }
    await ctx.db.patch(templateId, { updatedAt: Date.now() });
  },
});

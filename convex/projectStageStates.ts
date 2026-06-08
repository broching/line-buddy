import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { cancelFieldReminderByKey } from "./reminders";
import { writeAuditLog } from "./lib/audit";

export const listByProject = query({
  args: { projectId: v.id("projects"), organizationId: v.id("organizations") },
  handler: async (ctx, { projectId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    const states = await ctx.db
      .query("projectStageStates")
      .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
      .collect();
    states.sort((a, b) => a.stageOrder - b.stageOrder);
    return states;
  },
});

// Manually set a field value from the dashboard.
// Confidence 1.0 indicates a human-entered value (overrides AI).
export const updateField = mutation({
  args: {
    organizationId: v.id("organizations"),
    stageStateId: v.id("projectStageStates"),
    fieldKey: v.string(),
    value: v.string(),
    fieldLabel: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, stageStateId, fieldKey, value, fieldLabel }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const state = await ctx.db.get(stageStateId);
    if (!state || state.organizationId !== organizationId) throw new Error("Not found");

    const current = (state.collectedFields as Record<string, unknown>) ?? {};
    await ctx.db.patch(stageStateId, {
      collectedFields: {
        ...current,
        [fieldKey]: { value, extractedAt: Date.now(), confidence: 1.0 },
      },
    });

    await cancelFieldReminderByKey(ctx, stageStateId, fieldKey);

    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "field.updated",
      entityType: "projectStageState",
      entityId: stageStateId,
      payload: { fieldKey, fieldLabel, value },
    });

    // Insert a system message so the edit appears in the group chat history
    const project = await ctx.db.get(state.projectId);
    if (project) {
      const label = fieldLabel ?? fieldKey;
      await ctx.db.insert("messages", {
        organizationId,
        groupChatId: project.groupChatId,
        projectId: state.projectId,
        lineMessageId: `sys_${stageStateId}_${fieldKey}_${Date.now()}`,
        lineUserId: "system:dashboard",
        text: `[Dashboard] ${user.name} set ${label} → "${value}"`,
        messageType: "other",
        timestamp: Date.now(),
        routingMethod: "manual",
        processingStatus: "complete",
      });
    }
  },
});

// Update a field from an AI action — no user auth required.
// Supports retroactive updates to completed stages.
export const updateFieldFromAI = internalMutation({
  args: {
    stageStateId: v.id("projectStageStates"),
    fieldKey: v.string(),
    value: v.string(),
    confidence: v.number(),
    isUpdate: v.boolean(),
    sourceMessageId: v.id("messages"),
  },
  handler: async (ctx, { stageStateId, fieldKey, value, confidence, isUpdate, sourceMessageId }) => {
    const state = await ctx.db.get(stageStateId);
    if (!state) return;

    const current = (state.collectedFields as Record<
      string,
      { value: string; extractedAt: number; confidence: number }
    >) ?? {};

    const prev = current[fieldKey];
    // Only overwrite if: new field, explicit update, or higher confidence
    if (prev && !isUpdate && prev.confidence >= confidence) return;

    await ctx.db.patch(stageStateId, {
      collectedFields: {
        ...current,
        [fieldKey]: { value, extractedAt: Date.now(), confidence },
      },
    });

    await cancelFieldReminderByKey(ctx, stageStateId, fieldKey);

    await writeAuditLog(ctx, {
      organizationId: state.organizationId,
      actorType: "bot",
      eventType: "field.updated",
      entityType: "projectStageState",
      entityId: stageStateId,
      payload: { fieldKey, value, confidence, isUpdate, sourceMessageId },
    });

    // Insert a system message so the edit appears in chat history
    const project = await ctx.db.get(state.projectId);
    if (project) {
      const now = Date.now();
      await ctx.db.insert("messages", {
        organizationId: state.organizationId,
        groupChatId: project.groupChatId,
        projectId: state.projectId,
        lineMessageId: `ai_update_${stageStateId}_${fieldKey}_${now}`,
        lineUserId: "system:dashboard",
        text: `[AI] Updated ${fieldKey} → "${value}"`,
        messageType: "other",
        timestamp: now,
        routingMethod: "ai",
        processingStatus: "complete",
      });
    }
  },
});

export const clearField = mutation({
  args: {
    organizationId: v.id("organizations"),
    stageStateId: v.id("projectStageStates"),
    fieldKey: v.string(),
    fieldLabel: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, stageStateId, fieldKey, fieldLabel }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const state = await ctx.db.get(stageStateId);
    if (!state || state.organizationId !== organizationId) throw new Error("Not found");

    const current = { ...(state.collectedFields as Record<string, unknown>) };
    delete current[fieldKey];
    await ctx.db.patch(stageStateId, { collectedFields: current });

    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "field.cleared",
      entityType: "projectStageState",
      entityId: stageStateId,
      payload: { fieldKey, fieldLabel },
    });

    const project = await ctx.db.get(state.projectId);
    if (project) {
      const label = fieldLabel ?? fieldKey;
      await ctx.db.insert("messages", {
        organizationId,
        groupChatId: project.groupChatId,
        projectId: state.projectId,
        lineMessageId: `sys_${stageStateId}_${fieldKey}_clr_${Date.now()}`,
        lineUserId: "system:dashboard",
        text: `[Dashboard] ${user.name} cleared ${label}`,
        messageType: "other",
        timestamp: Date.now(),
        routingMethod: "manual",
        processingStatus: "complete",
      });
    }
  },
});

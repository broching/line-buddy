import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { cancelFieldReminderByKey } from "./reminders";
import { writeAuditLog } from "./lib/audit";
import { mergeFieldComponents, type CollectedFieldValue } from "./lib/fieldMerge";

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
    // When set, only this sub-attribute is updated (siblings under the same
    // field are preserved) — used to edit one part of a composite field
    // (e.g. just "Material" under "Roof description") without wiping the rest.
    // When omitted, the whole field is replaced as a plain scalar, discarding
    // any existing sub-fields — an explicit human override.
    subKey: v.optional(v.string()),
    subLabel: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, stageStateId, fieldKey, value, fieldLabel, subKey, subLabel }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const state = await ctx.db.get(stageStateId);
    if (!state || state.organizationId !== organizationId) throw new Error("Not found");

    const current = (state.collectedFields ?? {}) as Record<string, CollectedFieldValue>;
    const now = Date.now();
    const updatedField: CollectedFieldValue = subKey
      ? mergeFieldComponents(current[fieldKey], [{ subKey, subLabel: subLabel ?? subKey, value, confidence: 1.0 }], now)
      : { value, extractedAt: now, confidence: 1.0 };

    await ctx.db.patch(stageStateId, {
      collectedFields: { ...current, [fieldKey]: updatedField },
    });

    await cancelFieldReminderByKey(ctx, stageStateId, fieldKey);

    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "field.updated",
      entityType: "projectStageState",
      entityId: stageStateId,
      payload: { fieldKey, fieldLabel, subKey, value },
    });

    // Insert a system message so the edit appears in the group chat history
    const project = await ctx.db.get(state.projectId);
    if (project) {
      const label = subLabel ?? fieldLabel ?? fieldKey;
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
    components: v.array(
      v.object({
        subKey: v.string(),
        subLabel: v.string(),
        value: v.string(),
        confidence: v.number(),
      })
    ),
    isUpdate: v.boolean(),
    sourceMessageId: v.id("messages"),
  },
  handler: async (ctx, { stageStateId, fieldKey, components, isUpdate, sourceMessageId }) => {
    const state = await ctx.db.get(stageStateId);
    if (!state) return;

    const current = (state.collectedFields ?? {}) as Record<string, CollectedFieldValue>;
    const now = Date.now();
    const updatedField = mergeFieldComponents(current[fieldKey], components, now);

    await ctx.db.patch(stageStateId, {
      collectedFields: { ...current, [fieldKey]: updatedField },
    });

    await cancelFieldReminderByKey(ctx, stageStateId, fieldKey);

    await writeAuditLog(ctx, {
      organizationId: state.organizationId,
      actorType: "bot",
      eventType: "field.updated",
      entityType: "projectStageState",
      entityId: stageStateId,
      payload: { fieldKey, components, isUpdate, sourceMessageId },
    });

    // Insert a system message so the edit appears in chat history
    const project = await ctx.db.get(state.projectId);
    if (project) {
      const summary = components.map((c) => `${c.subLabel} → "${c.value}"`).join(", ");
      await ctx.db.insert("messages", {
        organizationId: state.organizationId,
        groupChatId: project.groupChatId,
        projectId: state.projectId,
        lineMessageId: `ai_update_${stageStateId}_${fieldKey}_${now}`,
        lineUserId: "system:dashboard",
        text: `[AI] Updated ${fieldKey}: ${summary}`,
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
    // When set, only this sub-attribute is removed; if it's the last
    // remaining sub-field, the whole field entry is removed too.
    subKey: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, stageStateId, fieldKey, fieldLabel, subKey }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const state = await ctx.db.get(stageStateId);
    if (!state || state.organizationId !== organizationId) throw new Error("Not found");

    const current = { ...(state.collectedFields as Record<string, CollectedFieldValue>) };
    if (subKey && current[fieldKey]?.subFields) {
      const remainingSubFields = { ...current[fieldKey].subFields };
      delete remainingSubFields[subKey];
      if (Object.keys(remainingSubFields).length === 0) {
        delete current[fieldKey];
      } else {
        const entries = Object.values(remainingSubFields);
        current[fieldKey] = {
          value: entries.map((e) => e.value).join(", "),
          confidence: Math.min(...entries.map((e) => e.confidence)),
          extractedAt: Date.now(),
          subFields: remainingSubFields,
        };
      }
    } else {
      delete current[fieldKey];
    }
    await ctx.db.patch(stageStateId, { collectedFields: current });

    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "field.cleared",
      entityType: "projectStageState",
      entityId: stageStateId,
      payload: { fieldKey, fieldLabel, subKey },
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

import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";
import { writeAuditLog } from "./lib/audit";
import { internal } from "./_generated/api";
import {
  scheduleReminderForStage,
  cancelReminderForStage,
  scheduleFieldRemindersForStage,
  cancelAllFieldRemindersForStage,
} from "./reminders";

// ─── Stage completion evaluation ─────────────────────────────────────────────

function isStageComplete(
  collectedFields: Record<string, unknown>,
  stageTemplate: { completionRule: string; requiredFields: Array<{ key: string; isRequired: boolean }> }
): boolean {
  if (stageTemplate.completionRule === "manual") return false;
  if (stageTemplate.completionRule === "all_required_fields") {
    const requiredKeys = stageTemplate.requiredFields
      .filter((f) => f.isRequired)
      .map((f) => f.key);
    if (requiredKeys.length === 0) return true; // no required fields → auto-complete
    return requiredKeys.every((k) => k in collectedFields);
  }
  return false; // "custom" rules deferred to Phase 6
}

// ─── Initialize stages when a project is created ─────────────────────────────

export async function initializeProjectStages(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  templateId: Id<"workflowTemplates">,
  organizationId: Id<"organizations">
): Promise<{ firstStageStateId: Id<"projectStageStates"> | null; firstStageId: Id<"workflowStageTemplates"> | null }> {
  const project = await ctx.db.get(projectId);
  if (!project) return { firstStageStateId: null, firstStageId: null };

  const stages = await ctx.db
    .query("workflowStageTemplates")
    .withIndex("byTemplateId", (q) => q.eq("templateId", templateId))
    .collect();
  stages.sort((a, b) => a.order - b.order);

  if (stages.length === 0) {
    return { firstStageStateId: null, firstStageId: null };
  }

  let firstStageStateId: Id<"projectStageStates"> | null = null;
  let firstStageId: Id<"workflowStageTemplates"> | null = null;

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const isFirst = i === 0;
    const now = Date.now();
    const stateId = await ctx.db.insert("projectStageStates", {
      projectId,
      organizationId,
      stageTemplateId: stage._id,
      stageOrder: stage.order,
      status: isFirst ? "active" : "pending",
      collectedFields: {},
      startedAt: isFirst ? now : undefined,
      reminderSentCount: 0,
    });
    if (isFirst) {
      firstStageStateId = stateId;
      firstStageId = stage._id;

      if (stage.reminderDelayMs > 0) {
        await scheduleReminderForStage(ctx, {
          stageStateId: stateId,
          projectId,
          organizationId,
          reminderDelayMs: stage.reminderDelayMs,
        });
      }
      await scheduleFieldRemindersForStage(ctx, {
        stageStateId: stateId,
        projectId,
        organizationId,
        groupChatId: project.groupChatId,
        requiredFields: stage.requiredFields,
      });
    }
  }

  return { firstStageStateId, firstStageId };
}

// ─── Advance a project to the next stage ─────────────────────────────────────
// Returns info about the transition for callers that need to send LINE messages.

export async function advanceProjectStage(
  ctx: MutationCtx,
  projectId: Id<"projects">
): Promise<{ advanced: boolean; completed: boolean; nextStageName?: string; nextStageOrder?: number }> {
  const project = await ctx.db.get(projectId);
  if (!project || project.status !== "active") return { advanced: false, completed: false };

  // Find the currently active stage state
  const activeState = await ctx.db
    .query("projectStageStates")
    .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
    .filter((q) => q.eq(q.field("status"), "active"))
    .unique();
  if (!activeState) return { advanced: false, completed: false };

  const now = Date.now();

  // Cancel all reminders (stage-level + per-field) for the completed stage
  await cancelReminderForStage(ctx, activeState._id, activeState.activeReminderJobId);
  await cancelAllFieldRemindersForStage(ctx, activeState._id);

  // Complete the current stage
  await ctx.db.patch(activeState._id, {
    status: "completed",
    completedAt: now,
  });

  // Fire stage completion actions (if any are configured)
  await ctx.scheduler.runAfter(0, internal.stageActions.fire, {
    stageTemplateId: activeState.stageTemplateId,
    projectId,
    organizationId: project.organizationId,
    groupChatId: project.groupChatId,
  });

  // Find the next pending stage (next by order)
  const allStates = await ctx.db
    .query("projectStageStates")
    .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
    .collect();

  const nextState = allStates
    .filter((s) => s.status === "pending")
    .sort((a, b) => a.stageOrder - b.stageOrder)[0];

  if (!nextState) {
    // All stages done — project complete
    await ctx.db.patch(projectId, { status: "completed", completedAt: now, currentStageId: undefined, currentStageOrder: 0 });
    await writeAuditLog(ctx, {
      organizationId: project.organizationId,
      actorType: "system",
      eventType: "project.completed",
      entityType: "project",
      entityId: projectId,
      payload: { projectName: project.name },
    });
    return { advanced: true, completed: true };
  }

  const nextStageTemplate = await ctx.db.get(nextState.stageTemplateId);

  // Activate next stage
  await ctx.db.patch(nextState._id, { status: "active", startedAt: now });
  await ctx.db.patch(projectId, {
    currentStageId: nextState.stageTemplateId,
    currentStageOrder: nextState.stageOrder,
  });

  // Schedule reminders for newly-activated stage
  if (nextStageTemplate && nextStageTemplate.reminderDelayMs > 0) {
    await scheduleReminderForStage(ctx, {
      stageStateId: nextState._id,
      projectId,
      organizationId: project.organizationId,
      reminderDelayMs: nextStageTemplate.reminderDelayMs,
    });
  }
  if (nextStageTemplate) {
    await scheduleFieldRemindersForStage(ctx, {
      stageStateId: nextState._id,
      projectId,
      organizationId: project.organizationId,
      groupChatId: project.groupChatId,
      requiredFields: nextStageTemplate.requiredFields,
    });
  }

  await writeAuditLog(ctx, {
    organizationId: project.organizationId,
    actorType: "system",
    eventType: "project.stageAdvanced",
    entityType: "project",
    entityId: projectId,
    payload: {
      fromStageOrder: activeState.stageOrder,
      toStageOrder: nextState.stageOrder,
      toStageName: nextStageTemplate?.name,
    },
  });

  return {
    advanced: true,
    completed: false,
    nextStageName: nextStageTemplate?.name,
    nextStageOrder: nextState.stageOrder,
  };
}

// ─── Evaluate and auto-advance if complete ────────────────────────────────────
// Called after field extraction (Phase 6) or manual field update.

export const evaluateAndAdvance = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db.get(projectId);
    if (!project || project.status !== "active") return { advanced: false };

    const activeState = await ctx.db
      .query("projectStageStates")
      .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();
    if (!activeState) return { advanced: false };

    const stageTemplate = await ctx.db.get(activeState.stageTemplateId);
    if (!stageTemplate) return { advanced: false };

    if (!isStageComplete(activeState.collectedFields ?? {}, stageTemplate)) {
      return { advanced: false };
    }

    return advanceProjectStage(ctx, projectId);
  },
});

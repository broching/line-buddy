import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, requireMembership } from "./lib/auth";
import { writeAuditLog } from "./lib/audit";
import { initializeProjectStages, advanceProjectStage } from "./workflow";
import {
  scheduleReminderForStage,
  cancelReminderForStage,
  scheduleFieldRemindersForStage,
  cancelAllFieldRemindersForStage,
} from "./reminders";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(v.union(
      v.literal("active"), v.literal("completed"), v.literal("archived"), v.literal("paused")
    )),
  },
  handler: async (ctx, { organizationId, status }) => {
    await requireMembership(ctx, organizationId);
    let q = ctx.db.query("projects").withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId));
    const projects = await q.collect();
    return status ? projects.filter((p) => p.status === status) : projects.filter((p) => p.status !== "archived");
  },
});

export const listWithMeta = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);
    const projects = await ctx.db
      .query("projects")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .filter((q) => q.neq(q.field("status"), "archived"))
      .collect();

    return Promise.all(
      projects.map(async (p) => {
        const group = await ctx.db.get(p.groupChatId);
        const lastMsg = await ctx.db
          .query("messages")
          .withIndex("byProjectId", (q) => q.eq("projectId", p._id))
          .order("desc")
          .first();
        return {
          ...p,
          groupName: group?.displayName ?? null,
          groupPictureUrl: group?.pictureUrl ?? null,
          lastMessageText: lastMsg?.text ?? null,
          lastMessageAt: lastMsg?.timestamp ?? null,
        };
      })
    );
  },
});

export const listByGroup = query({
  args: { groupChatId: v.id("groupChats"), organizationId: v.id("organizations") },
  handler: async (ctx, { groupChatId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    return ctx.db
      .query("projects")
      .withIndex("byGroupChatId", (q) => q.eq("groupChatId", groupChatId))
      .filter((q) => q.neq(q.field("status"), "archived"))
      .collect();
  },
});

// Full project detail: project + all stage states + stage template configs joined
export const get = query({
  args: { projectId: v.id("projects"), organizationId: v.id("organizations") },
  handler: async (ctx, { projectId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    const project = await ctx.db.get(projectId);
    if (!project || project.organizationId !== organizationId) return null;

    const stageStates = await ctx.db
      .query("projectStageStates")
      .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
      .collect();
    stageStates.sort((a, b) => a.stageOrder - b.stageOrder);

    const stagesWithTemplates = await Promise.all(
      stageStates.map(async (state) => {
        const template = await ctx.db.get(state.stageTemplateId);
        return { ...state, template };
      })
    );

    const groupChat = await ctx.db.get(project.groupChatId);
    const template = await ctx.db.get(project.workflowTemplateId);

    return { ...project, stageStates: stagesWithTemplates, groupChat, workflowTemplate: template };
  },
});

// Creates a project and initializes stage states.
// Returns enough info for the LINE bot to compose a welcome message.
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
    workflowTemplateId: v.id("workflowTemplates"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, groupChatId, workflowTemplateId, name, description }) => {
    const { user } = await requireMembership(ctx, organizationId);

    // Validate template belongs to org
    const template = await ctx.db.get(workflowTemplateId);
    if (!template || template.organizationId !== organizationId || template.isArchived) {
      throw new Error("Template not found");
    }
    // Validate group belongs to org
    const group = await ctx.db.get(groupChatId);
    if (!group || group.organizationId !== organizationId) {
      throw new Error("Group not found");
    }

    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      organizationId,
      groupChatId,
      workflowTemplateId,
      name,
      description,
      status: "active",
      currentStageOrder: 1,
      createdBy: user._id,
      createdAt: now,
    });

    const { firstStageId } = await initializeProjectStages(ctx, projectId, workflowTemplateId, organizationId);

    if (firstStageId) {
      await ctx.db.patch(projectId, { currentStageId: firstStageId });
    }

    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "project.created",
      entityType: "project",
      entityId: projectId,
      payload: { name, templateId: workflowTemplateId },
    });

    // Return first stage info for LINE bot response
    const firstStage = firstStageId ? await ctx.db.get(firstStageId) : null;
    let responsibleRoleName: string | undefined;
    if (firstStage?.responsibleRoleId) {
      const role = await ctx.db.get(firstStage.responsibleRoleId);
      responsibleRoleName = role?.name;
    }

    return {
      projectId,
      projectName: name,
      firstStage: firstStage ? {
        name: firstStage.name,
        description: firstStage.description,
        requiredFields: firstStage.requiredFields,
        responsibleRole: responsibleRoleName,
      } : null,
    };
  },
});

// Called from the LINE webhook — creates a project without a dashboard user.
// Used by /new-project bot command.
export const createFromBot = mutation({
  args: {
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
    workflowTemplateId: v.id("workflowTemplates"),
    name: v.string(),
  },
  handler: async (ctx, { organizationId, groupChatId, workflowTemplateId, name }) => {
    const template = await ctx.db.get(workflowTemplateId);
    if (!template || template.organizationId !== organizationId || template.isArchived) {
      throw new Error("Template not found");
    }
    const group = await ctx.db.get(groupChatId);
    if (!group || group.organizationId !== organizationId) throw new Error("Group not found");

    // Find a real user to attribute to (org owner)
    const membership = await ctx.db
      .query("memberships")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();
    if (!membership) throw new Error("No members found");

    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      organizationId,
      groupChatId,
      workflowTemplateId,
      name,
      status: "active",
      currentStageOrder: 1,
      createdBy: membership.userId,
      createdAt: now,
    });

    const { firstStageId } = await initializeProjectStages(ctx, projectId, workflowTemplateId, organizationId);
    if (firstStageId) await ctx.db.patch(projectId, { currentStageId: firstStageId });

    await writeAuditLog(ctx, {
      organizationId,
      actorType: "bot",
      eventType: "project.created",
      entityType: "project",
      entityId: projectId,
      payload: { name, templateId: workflowTemplateId, source: "bot" },
    });

    const firstStage = firstStageId ? await ctx.db.get(firstStageId) : null;
    let responsibleRoleName: string | undefined;
    if (firstStage?.responsibleRoleId) {
      const role = await ctx.db.get(firstStage.responsibleRoleId);
      responsibleRoleName = role?.name;
    }

    return {
      projectId,
      projectName: name,
      firstStage: firstStage ? {
        name: firstStage.name,
        description: firstStage.description,
        requiredFields: firstStage.requiredFields,
        responsibleRole: responsibleRoleName,
      } : null,
    };
  },
});

export const advanceStage = mutation({
  args: { projectId: v.id("projects"), organizationId: v.id("organizations") },
  handler: async (ctx, { projectId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    const project = await ctx.db.get(projectId);
    if (!project || project.organizationId !== organizationId) throw new Error("Project not found");
    if (project.status !== "active") throw new Error("Project is not active");
    return advanceProjectStage(ctx, projectId);
  },
});

export const skipStage = mutation({
  args: {
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, organizationId, reason }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const project = await ctx.db.get(projectId);
    if (!project || project.organizationId !== organizationId) throw new Error("Project not found");
    if (project.status !== "active") throw new Error("Project is not active");

    const activeState = await ctx.db
      .query("projectStageStates")
      .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();
    if (!activeState) throw new Error("No active stage found");

    const now = Date.now();

    // Cancel all reminders (stage-level + per-field) for the skipped stage
    await cancelReminderForStage(ctx, activeState._id, activeState.activeReminderJobId);
    await cancelAllFieldRemindersForStage(ctx, activeState._id);

    await ctx.db.patch(activeState._id, {
      status: "skipped",
      skippedAt: now,
      skippedReason: reason,
    });

    // Activate the next pending stage
    const allStates = await ctx.db
      .query("projectStageStates")
      .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
      .collect();
    const nextState = allStates
      .filter((s) => s.status === "pending")
      .sort((a, b) => a.stageOrder - b.stageOrder)[0];

    if (!nextState) {
      await ctx.db.patch(projectId, { status: "completed", completedAt: now });
      return { skipped: true, completed: true };
    }

    await ctx.db.patch(nextState._id, { status: "active", startedAt: now });
    await ctx.db.patch(projectId, {
      currentStageId: nextState.stageTemplateId,
      currentStageOrder: nextState.stageOrder,
    });

    const nextTemplate = await ctx.db.get(nextState.stageTemplateId);

    // Schedule reminders for newly-activated stage
    if (nextTemplate && nextTemplate.reminderDelayMs > 0) {
      await scheduleReminderForStage(ctx, {
        stageStateId: nextState._id,
        projectId,
        organizationId,
        reminderDelayMs: nextTemplate.reminderDelayMs,
      });
    }
    if (nextTemplate) {
      await scheduleFieldRemindersForStage(ctx, {
        stageStateId: nextState._id,
        projectId,
        organizationId,
        groupChatId: project.groupChatId,
        requiredFields: nextTemplate.requiredFields,
      });
    }

    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "project.stageSkipped",
      entityType: "project",
      entityId: projectId,
      payload: { skippedOrder: activeState.stageOrder, reason },
    });

    return { skipped: true, completed: false, nextStageName: nextTemplate?.name };
  },
});

export const archive = mutation({
  args: { projectId: v.id("projects"), organizationId: v.id("organizations") },
  handler: async (ctx, { projectId, organizationId }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const project = await ctx.db.get(projectId);
    if (!project || project.organizationId !== organizationId) throw new Error("Not found");
    await ctx.db.patch(projectId, { status: "archived" });
    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "project.archived",
      entityType: "project",
      entityId: projectId,
      payload: {},
    });
  },
});

export const pause = mutation({
  args: { projectId: v.id("projects"), organizationId: v.id("organizations") },
  handler: async (ctx, { projectId, organizationId }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const project = await ctx.db.get(projectId);
    if (!project || project.organizationId !== organizationId) throw new Error("Not found");
    if (project.status !== "active") throw new Error("Project is not active");

    const activeState = await ctx.db
      .query("projectStageStates")
      .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (activeState) {
      await cancelReminderForStage(ctx, activeState._id, activeState.activeReminderJobId);
      await cancelAllFieldRemindersForStage(ctx, activeState._id);
    }

    await ctx.db.patch(projectId, { status: "paused" });
    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "project.paused",
      entityType: "project",
      entityId: projectId,
      payload: { name: project.name },
    });
  },
});

export const resume = mutation({
  args: { projectId: v.id("projects"), organizationId: v.id("organizations") },
  handler: async (ctx, { projectId, organizationId }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const project = await ctx.db.get(projectId);
    if (!project || project.organizationId !== organizationId) throw new Error("Not found");
    if (project.status !== "paused") throw new Error("Project is not paused");

    await ctx.db.patch(projectId, { status: "active" });

    const activeState = await ctx.db
      .query("projectStageStates")
      .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (activeState) {
      const stageTemplate = await ctx.db.get(activeState.stageTemplateId);
      if (stageTemplate && stageTemplate.reminderDelayMs > 0) {
        await scheduleReminderForStage(ctx, {
          stageStateId: activeState._id,
          projectId,
          organizationId,
          reminderDelayMs: stageTemplate.reminderDelayMs,
        });
      }
      if (stageTemplate) {
        await scheduleFieldRemindersForStage(ctx, {
          stageStateId: activeState._id,
          projectId,
          organizationId,
          groupChatId: project.groupChatId,
          requiredFields: stageTemplate.requiredFields,
        });
      }
    }

    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "project.resumed",
      entityType: "project",
      entityId: projectId,
      payload: { name: project.name },
    });
  },
});

export const complete = mutation({
  args: { projectId: v.id("projects"), organizationId: v.id("organizations") },
  handler: async (ctx, { projectId, organizationId }) => {
    const { user } = await requireMembership(ctx, organizationId);
    const project = await ctx.db.get(projectId);
    if (!project || project.organizationId !== organizationId) throw new Error("Not found");
    if (project.status === "completed" || project.status === "archived") {
      throw new Error("Project is already done");
    }

    const activeState = await ctx.db
      .query("projectStageStates")
      .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();

    if (activeState) {
      await cancelReminderForStage(ctx, activeState._id, activeState.activeReminderJobId);
      await cancelAllFieldRemindersForStage(ctx, activeState._id);
    }

    await ctx.db.patch(projectId, { status: "completed", completedAt: Date.now() });
    await writeAuditLog(ctx, {
      organizationId,
      actorId: user._id,
      actorType: "user",
      eventType: "project.completed",
      entityType: "project",
      entityId: projectId,
      payload: { name: project.name },
    });
  },
});

// Returns all projects for a group with their stage states + stage templates embedded.
// Used by the group detail page right panel.
export const listByGroupWithStages = query({
  args: { groupChatId: v.id("groupChats"), organizationId: v.id("organizations") },
  handler: async (ctx, { groupChatId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    const projects = await ctx.db
      .query("projects")
      .withIndex("byGroupChatId", (q) => q.eq("groupChatId", groupChatId))
      .filter((q) => q.neq(q.field("status"), "archived"))
      .collect();

    return Promise.all(
      projects.map(async (project) => {
        const stageStates = await ctx.db
          .query("projectStageStates")
          .withIndex("byProjectId", (q) => q.eq("projectId", project._id))
          .collect();
        stageStates.sort((a, b) => a.stageOrder - b.stageOrder);

        const stagesWithTemplates = await Promise.all(
          stageStates.map(async (state) => {
            const template = await ctx.db.get(state.stageTemplateId);
            return { ...state, template };
          })
        );

        return { ...project, stageStates: stagesWithTemplates };
      })
    );
  },
});

// Returns the active project for a group (for /status command routing)
export const getActiveByGroup = query({
  args: { lineGroupId: v.string() },
  handler: async (ctx, { lineGroupId }) => {
    const group = await ctx.db
      .query("groupChats")
      .withIndex("byLineGroupId", (q) => q.eq("lineGroupId", lineGroupId))
      .unique();
    if (!group) return null;

    const projects = await ctx.db
      .query("projects")
      .withIndex("byGroupChatId", (q) => q.eq("groupChatId", group._id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    return projects;
  },
});

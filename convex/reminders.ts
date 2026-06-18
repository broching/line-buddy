import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";
import { requireMembership } from "./lib/auth";
import { sendGroupMessage } from "./lib/messaging";
import { buildChannelSendInfo, resolveSendCreds, type ChannelSendInfo } from "./lib/channelContext";

// ─── Types ─────────────────────────────────────────────────────────────────────

type FieldReminderJobs = Record<string, { jobId: string; sentCount: number; reminderId?: Id<"reminders"> }>;

// Explicit return type avoids circular inference when internalAction calls this query
type FieldReminderContext = {
  stageStatus: string;
  isFieldMissing: boolean;
  sentCount: number;
  maxReminderCount: number;
  reminderDelayMs: number;
  reminderMessage: string | undefined;
  fieldLabel: string;
  reminderId: Id<"reminders"> | undefined;
  channelInfo: ChannelSendInfo | null;
  projectName: string;
  stageName: string;
  mentions: Array<{ lineUserId: string; displayName: string }>;
} | null;

type SendContext = {
  pendingReminderId: Id<"reminders"> | null;
  stageStatus: string;
  channelInfo: ChannelSendInfo | null;
  projectName: string;
  stageName: string;
  stageOrder: number;
  missingFields: string[];
} | null;

// ─── Per-field reminder helpers (called from within mutations) ────────────────

export async function scheduleFieldRemindersForStage(
  ctx: MutationCtx,
  args: {
    stageStateId: Id<"projectStageStates">;
    projectId: Id<"projects">;
    organizationId: Id<"organizations">;
    groupChatId: Id<"groupChats">;
    requiredFields: Array<{
      key: string;
      label?: string;
      reminderDelayMs?: number;
      maxReminderCount?: number;
      responsibleRoleIds?: Id<"roles">[];
      reminderMessage?: string;
    }>;
  }
) {
  const { stageStateId, projectId, organizationId, groupChatId, requiredFields } = args;
  const fieldJobs: FieldReminderJobs = {};

  for (const field of requiredFields) {
    const delay = field.reminderDelayMs ?? 0;
    const maxCount = field.maxReminderCount ?? 0;
    const roles = field.responsibleRoleIds ?? [];
    if (delay <= 0 || maxCount <= 0 || roles.length === 0) continue;

    const jobId = await ctx.scheduler.runAfter(
      delay,
      internal.reminders.sendFieldReminder,
      { stageStateId, projectId, organizationId, groupChatId, fieldKey: field.key }
    );

    const reminderId = await ctx.db.insert("reminders", {
      organizationId,
      projectId,
      stageStateId,
      scheduledFor: Date.now() + delay,
      convexJobId: jobId,
      status: "scheduled",
      fieldKey: field.key,
      fieldLabel: field.label,
      reminderMessage: field.reminderMessage,
      roleIds: field.responsibleRoleIds,
    });

    fieldJobs[field.key] = { jobId, sentCount: 0, reminderId };
  }

  if (Object.keys(fieldJobs).length > 0) {
    await ctx.db.patch(stageStateId, { fieldReminderJobs: fieldJobs });
  }
}

export async function cancelAllFieldRemindersForStage(
  ctx: MutationCtx,
  stageStateId: Id<"projectStageStates">,
  cancelReason = "stage_advanced"
) {
  const state = await ctx.db.get(stageStateId);
  if (!state?.fieldReminderJobs) return;

  const jobs = state.fieldReminderJobs as FieldReminderJobs;
  const now = Date.now();
  for (const entry of Object.values(jobs)) {
    try { await ctx.scheduler.cancel(entry.jobId as Id<"_scheduled_functions">); } catch { /* already fired */ }
    if (entry.reminderId) {
      await ctx.db.patch(entry.reminderId, { status: "cancelled", cancelledAt: now, cancelReason });
    }
  }
  await ctx.db.patch(stageStateId, { fieldReminderJobs: undefined });
}

export async function cancelFieldReminderByKey(
  ctx: MutationCtx,
  stageStateId: Id<"projectStageStates">,
  fieldKey: string,
  cancelReason = "field_filled"
) {
  const state = await ctx.db.get(stageStateId);
  if (!state?.fieldReminderJobs) return;

  const jobs = { ...(state.fieldReminderJobs as FieldReminderJobs) };
  const entry = jobs[fieldKey];
  if (!entry) return;

  try { await ctx.scheduler.cancel(entry.jobId as Id<"_scheduled_functions">); } catch { /* already fired */ }
  if (entry.reminderId) {
    await ctx.db.patch(entry.reminderId, {
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelReason,
    });
  }
  delete jobs[fieldKey];
  await ctx.db.patch(stageStateId, { fieldReminderJobs: Object.keys(jobs).length ? jobs : undefined });
}

// ─── Per-field scheduled action ───────────────────────────────────────────────

export const sendFieldReminder = internalAction({
  args: {
    stageStateId: v.id("projectStageStates"),
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
    fieldKey: v.string(),
  },
  handler: async (ctx, { stageStateId, projectId, organizationId, groupChatId, fieldKey }) => {
    const data: FieldReminderContext = await ctx.runQuery(
      internal.reminders.loadFieldReminderContext,
      { stageStateId, projectId, organizationId, groupChatId, fieldKey }
    );

    if (!data || data.stageStatus !== "active" || !data.isFieldMissing) return;
    if (data.sentCount >= data.maxReminderCount) return;

    const body = data.reminderMessage?.trim() || `Please provide "${data.fieldLabel}" to continue.`;
    const mentions = data.mentions.map((m) => ({ userId: m.lineUserId, displayName: m.displayName }));

    let sendOk = false;
    const creds = data.channelInfo ? await resolveSendCreds(data.channelInfo) : null;
    if (creds) {
      sendOk = await sendGroupMessage(creds, data.channelInfo!.providerGroupId, {
        text: mentions.length > 0 ? body : `⏰ ${body}`,
        mentions,
      });
    }

    const newCount = data.sentCount + 1;

    // Schedule next job before mutation so we have the new jobId to store
    let newJobId: string | undefined;
    let newScheduledFor: number | undefined;
    if (newCount < data.maxReminderCount) {
      newJobId = await ctx.scheduler.runAfter(
        data.reminderDelayMs,
        internal.reminders.sendFieldReminder,
        { stageStateId, projectId, organizationId, groupChatId, fieldKey }
      );
      newScheduledFor = Date.now() + data.reminderDelayMs;
    }

    // Save the sent message to the chat feed
    const mentionNames = data.mentions.map((m) => `@${m.displayName}`).join(" ");
    const chatText = mentionNames
      ? `${mentionNames}\n⏰ ${data.reminderMessage?.trim() || `Please provide "${data.fieldLabel}" to continue.`}`
      : `⏰ ${data.reminderMessage?.trim() || `Please provide "${data.fieldLabel}" to continue.`}`;
    await ctx.runMutation(internal.ai.storeBotMessage, {
      organizationId,
      groupChatId,
      text: chatText,
      timestamp: Date.now(),
    });

    await ctx.runMutation(internal.reminders.recordFieldReminderSent, {
      stageStateId,
      fieldKey,
      newSentCount: newCount,
      succeeded: sendOk,
      reminderId: data.reminderId,
      newJobId,
      newScheduledFor,
      organizationId,
      projectId,
      fieldLabel: data.fieldLabel,
      reminderMessage: data.reminderMessage,
      roleIds: undefined,
    });
  },
});

// ─── Internal query for per-field context ─────────────────────────────────────

export const loadFieldReminderContext = internalQuery({
  args: {
    stageStateId: v.id("projectStageStates"),
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
    fieldKey: v.string(),
  },
  handler: async (ctx, { stageStateId, projectId, organizationId, groupChatId, fieldKey }) => {
    const stageState = await ctx.db.get(stageStateId);
    if (!stageState || stageState.projectId !== projectId) return null;

    const stageTemplate = await ctx.db.get(stageState.stageTemplateId);
    if (!stageTemplate) return null;

    const project = await ctx.db.get(projectId);
    if (!project || project.organizationId !== organizationId) return null;

    const group = await ctx.db.get(groupChatId);
    const channelInfo = group ? await buildChannelSendInfo(ctx, group) : null;

    const fieldConfig = stageTemplate.requiredFields.find((f) => f.key === fieldKey);
    if (!fieldConfig) return null;

    const collected = (stageState.collectedFields as Record<string, unknown>) ?? {};
    const isFieldMissing = fieldConfig.isRequired ? !(fieldKey in collected) : false;

    const jobs = (stageState.fieldReminderJobs as FieldReminderJobs | undefined) ?? {};
    const sentCount = jobs[fieldKey]?.sentCount ?? 0;
    const maxReminderCount = fieldConfig.maxReminderCount ?? 3;
    const reminderDelayMs = fieldConfig.reminderDelayMs ?? 0;

    // Resolve role → LINE user mappings for this group
    const roleIds = fieldConfig.responsibleRoleIds ?? [];
    const mappings = await ctx.db
      .query("groupChatRoleMappings")
      .withIndex("byGroupChatId", (q) => q.eq("groupChatId", groupChatId))
      .collect();

    const assignedByRole = new Map(mappings.map((m) => [m.roleId as string, m.lineUserId]));

    const mentions = await Promise.all(
      roleIds
        .map((roleId) => assignedByRole.get(roleId as string))
        .filter((uid): uid is string => !!uid)
        .map(async (lineUserId) => {
          const profile = await ctx.db
            .query("userLineProfiles")
            .withIndex("byOrganizationAndLineUserId", (q) =>
              q.eq("organizationId", organizationId).eq("lineUserId", lineUserId)
            )
            .unique();
          return {
            lineUserId,
            displayName: profile?.displayName ?? `…${lineUserId.slice(-8)}`,
          };
        })
    );

    return {
      stageStatus: stageState.status as string,
      isFieldMissing,
      sentCount,
      maxReminderCount,
      reminderDelayMs,
      reminderMessage: fieldConfig.reminderMessage,
      fieldLabel: fieldConfig.label,
      reminderId: jobs[fieldKey]?.reminderId,
      channelInfo,
      projectName: project.name,
      stageName: stageTemplate.name,
      mentions,
    };
  },
});

// ─── Internal mutation: record field reminder sent ────────────────────────────

export const recordFieldReminderSent = internalMutation({
  args: {
    stageStateId: v.id("projectStageStates"),
    fieldKey: v.string(),
    newSentCount: v.number(),
    succeeded: v.boolean(),
    reminderId: v.optional(v.id("reminders")),
    newJobId: v.optional(v.string()),
    newScheduledFor: v.optional(v.number()),
    organizationId: v.optional(v.id("organizations")),
    projectId: v.optional(v.id("projects")),
    fieldLabel: v.optional(v.string()),
    reminderMessage: v.optional(v.string()),
    roleIds: v.optional(v.array(v.id("roles"))),
  },
  handler: async (ctx, { stageStateId, fieldKey, newSentCount, reminderId, newJobId, newScheduledFor, organizationId, projectId, fieldLabel, reminderMessage, roleIds }) => {
    const state = await ctx.db.get(stageStateId);
    if (!state) return;

    const now = Date.now();

    // Mark existing reminder record as sent
    if (reminderId) {
      await ctx.db.patch(reminderId, { status: "sent", sentAt: now });
    }

    // Create new reminder record for the rescheduled job
    let newReminderId: Id<"reminders"> | undefined;
    if (newJobId && newScheduledFor && organizationId && projectId) {
      newReminderId = await ctx.db.insert("reminders", {
        organizationId,
        projectId,
        stageStateId,
        scheduledFor: newScheduledFor,
        convexJobId: newJobId,
        status: "scheduled",
        fieldKey,
        fieldLabel,
        reminderMessage,
        roleIds,
      });
    }

    const jobs = { ...((state.fieldReminderJobs as FieldReminderJobs | undefined) ?? {}) };
    if (jobs[fieldKey]) {
      jobs[fieldKey] = {
        sentCount: newSentCount,
        jobId: newJobId ?? jobs[fieldKey].jobId,
        reminderId: newReminderId,
      };
    }
    await ctx.db.patch(stageStateId, { fieldReminderJobs: jobs });
  },
});

// ─── Stage-level reminder helpers (kept for backwards compat) ─────────────────

export async function scheduleReminderForStage(
  ctx: MutationCtx,
  args: {
    stageStateId: Id<"projectStageStates">;
    projectId: Id<"projects">;
    organizationId: Id<"organizations">;
    reminderDelayMs: number;
  }
) {
  const { stageStateId, projectId, organizationId, reminderDelayMs } = args;

  const jobId = await ctx.scheduler.runAfter(
    reminderDelayMs,
    internal.reminders.send,
    { stageStateId, projectId, organizationId }
  );

  await ctx.db.insert("reminders", {
    organizationId,
    projectId,
    stageStateId,
    scheduledFor: Date.now() + reminderDelayMs,
    convexJobId: jobId,
    status: "scheduled",
  });

  await ctx.db.patch(stageStateId, { activeReminderJobId: jobId });
}

export async function cancelReminderForStage(
  ctx: MutationCtx,
  stageStateId: Id<"projectStageStates">,
  activeJobId?: string
) {
  if (!activeJobId) return;

  try {
    await ctx.scheduler.cancel(activeJobId as Id<"_scheduled_functions">);
  } catch { /* already fired */ }

  const pending = await ctx.db
    .query("reminders")
    .withIndex("byStageStateId", (q) => q.eq("stageStateId", stageStateId))
    .filter((q) => q.eq(q.field("status"), "scheduled"))
    .first();

  if (pending) {
    await ctx.db.patch(pending._id, {
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelReason: "stage_advanced",
    });
  }

  await ctx.db.patch(stageStateId, { activeReminderJobId: undefined });
}

// ─── Stage-level scheduled action (legacy) ────────────────────────────────────

export const send = internalAction({
  args: {
    stageStateId: v.id("projectStageStates"),
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { stageStateId, projectId, organizationId }) => {
    const data: SendContext = await ctx.runQuery(internal.reminders.loadSendContext, {
      stageStateId, projectId, organizationId,
    });

    if (!data || data.stageStatus !== "active" || !data.pendingReminderId) return;

    const creds = data.channelInfo ? await resolveSendCreds(data.channelInfo) : null;
    if (creds) {
      const text = buildReminderText(data);
      const ok = await sendGroupMessage(creds, data.channelInfo!.providerGroupId, { text });
      if (!ok) {
        await ctx.runMutation(internal.reminders.markFailed, { reminderId: data.pendingReminderId, stageStateId });
        return;
      }
    }

    await ctx.runMutation(internal.reminders.markSent, { reminderId: data.pendingReminderId, stageStateId });
  },
});

function buildReminderText(data: { projectName: string; stageName: string; stageOrder: number; missingFields: string[] }): string {
  const lines = [`⏰ Reminder: ${data.projectName}`, `Stage ${data.stageOrder}: ${data.stageName}`];
  if (data.missingFields.length > 0) {
    lines.push("", "Still needed:");
    data.missingFields.forEach((f) => lines.push(`• ${f}`));
  }
  lines.push("", "Please provide the above information to continue.");
  return lines.join("\n");
}

export const loadSendContext = internalQuery({
  args: {
    stageStateId: v.id("projectStageStates"),
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { stageStateId, projectId, organizationId }) => {
    const stageState = await ctx.db.get(stageStateId);
    if (!stageState || stageState.projectId !== projectId) return null;

    const stageTemplate = await ctx.db.get(stageState.stageTemplateId);
    if (!stageTemplate) return null;

    const project = await ctx.db.get(projectId);
    if (!project || project.organizationId !== organizationId) return null;

    const group = await ctx.db.get(project.groupChatId);
    const channelInfo = group ? await buildChannelSendInfo(ctx, group) : null;

    const pending = await ctx.db
      .query("reminders")
      .withIndex("byStageStateId", (q) => q.eq("stageStateId", stageStateId))
      .filter((q) => q.eq(q.field("status"), "scheduled"))
      .first();

    const collectedKeys = Object.keys((stageState.collectedFields as Record<string, unknown>) ?? {});
    const missingFields = stageTemplate.requiredFields
      .filter((f) => f.isRequired && !collectedKeys.includes(f.key))
      .map((f) => f.label);

    return {
      pendingReminderId: pending?._id ?? null,
      stageStatus: stageState.status as string,
      channelInfo,
      projectName: project.name,
      stageName: stageTemplate.name,
      stageOrder: stageState.stageOrder,
      missingFields,
    };
  },
});

export const markSent = internalMutation({
  args: { reminderId: v.id("reminders"), stageStateId: v.id("projectStageStates") },
  handler: async (ctx, { reminderId, stageStateId }) => {
    await ctx.db.patch(reminderId, { status: "sent", sentAt: Date.now() });
    const stageState = await ctx.db.get(stageStateId);
    if (stageState) {
      await ctx.db.patch(stageStateId, {
        activeReminderJobId: undefined,
        reminderSentCount: (stageState.reminderSentCount ?? 0) + 1,
      });
    }
  },
});

export const markFailed = internalMutation({
  args: { reminderId: v.id("reminders"), stageStateId: v.id("projectStageStates") },
  handler: async (ctx, { reminderId, stageStateId }) => {
    await ctx.db.patch(reminderId, { status: "failed" });
    await ctx.db.patch(stageStateId, { activeReminderJobId: undefined });
  },
});

// ─── Manual reminder: cancel a scheduled reminder ────────────────────────────

export const cancelManually = mutation({
  args: {
    reminderId: v.id("reminders"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { reminderId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    const reminder = await ctx.db.get(reminderId);
    if (!reminder || reminder.organizationId !== organizationId) throw new Error("Not found");
    if (reminder.status !== "scheduled") throw new Error("Only scheduled reminders can be cancelled");
    if (reminder.convexJobId) {
      try { await ctx.scheduler.cancel(reminder.convexJobId as Id<"_scheduled_functions">); } catch { /* already fired */ }
    }
    await ctx.db.patch(reminderId, { status: "cancelled", cancelledAt: Date.now(), cancelReason: "manual" });
  },
});

// ─── Manual reminder: schedule from the dashboard ────────────────────────────

export const scheduleManual = mutation({
  args: {
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    stageStateId: v.id("projectStageStates"),
    groupChatId: v.id("groupChats"),
    roleIds: v.array(v.id("roles")),
    message: v.string(),
    scheduledFor: v.number(),
  },
  handler: async (ctx, { projectId, organizationId, stageStateId, groupChatId, roleIds, message, scheduledFor }) => {
    await requireMembership(ctx, organizationId);
    // Create the record first so we have the ID to pass to the action
    const reminderId = await ctx.db.insert("reminders", {
      organizationId,
      projectId,
      stageStateId,
      scheduledFor,
      status: "scheduled",
      reminderMessage: message,
      roleIds,
    });
    const delay = Math.max(0, scheduledFor - Date.now());
    const jobId = await ctx.scheduler.runAfter(
      delay,
      internal.reminders.sendManualReminder,
      { reminderId, projectId, organizationId, groupChatId, roleIds, message }
    );
    await ctx.db.patch(reminderId, { convexJobId: jobId });
    return reminderId;
  },
});

// ─── Manual reminder: fire action ────────────────────────────────────────────

export const sendManualReminder = internalAction({
  args: {
    reminderId: v.id("reminders"),
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
    roleIds: v.array(v.id("roles")),
    message: v.string(),
  },
  handler: async (ctx, { reminderId, projectId, organizationId, groupChatId, roleIds, message }) => {
    const context: { channelInfo: ChannelSendInfo | null; mentions: Array<{ lineUserId: string; displayName: string }> } | null =
      await ctx.runQuery(internal.reminders.loadManualReminderContext, { organizationId, groupChatId, roleIds });
    if (!context) return;

    const mentions = context.mentions.map((m) => ({ userId: m.lineUserId, displayName: m.displayName }));

    let sendOk = false;
    const creds = context.channelInfo ? await resolveSendCreds(context.channelInfo) : null;
    if (creds) {
      sendOk = await sendGroupMessage(creds, context.channelInfo!.providerGroupId, {
        text: mentions.length > 0 ? message : `⏰ ${message}`,
        mentions,
      });
    }

    const now = Date.now();

    // Save to chat feed
    const mentionNames = context.mentions.map((m) => `@${m.displayName}`).join(" ");
    const chatText = mentionNames ? `${mentionNames}\n⏰ ${message}` : `⏰ ${message}`;
    await ctx.runMutation(internal.ai.storeBotMessage, { organizationId, groupChatId, text: chatText, timestamp: now });

    // Update reminder record
    await ctx.runMutation(internal.reminders.markReminderSentOrFailed, {
      reminderId,
      status: sendOk ? "sent" : "failed",
      sentAt: sendOk ? now : undefined,
    });
  },
});

export const loadManualReminderContext = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
    roleIds: v.array(v.id("roles")),
  },
  handler: async (ctx, { organizationId, groupChatId, roleIds }) => {
    const group = await ctx.db.get(groupChatId);
    if (!group) return null;
    const channelInfo = await buildChannelSendInfo(ctx, group);

    const mappings = await ctx.db
      .query("groupChatRoleMappings")
      .withIndex("byGroupChatId", (q) => q.eq("groupChatId", groupChatId))
      .collect();

    const assignedByRole = new Map(mappings.map((m) => [m.roleId as string, m.lineUserId]));

    const mentions = await Promise.all(
      roleIds
        .map((roleId) => assignedByRole.get(roleId as string))
        .filter((uid): uid is string => !!uid)
        .map(async (lineUserId) => {
          const profile = await ctx.db
            .query("userLineProfiles")
            .withIndex("byOrganizationAndLineUserId", (q) =>
              q.eq("organizationId", organizationId).eq("lineUserId", lineUserId)
            )
            .unique();
          return { lineUserId, displayName: profile?.displayName ?? `…${lineUserId.slice(-8)}` };
        })
    );

    return {
      channelInfo,
      mentions,
    };
  },
});

export const markReminderSentOrFailed = internalMutation({
  args: {
    reminderId: v.id("reminders"),
    status: v.union(v.literal("sent"), v.literal("failed")),
    sentAt: v.optional(v.number()),
  },
  handler: async (ctx, { reminderId, status, sentAt }) => {
    await ctx.db.patch(reminderId, { status, ...(sentAt ? { sentAt } : {}) });
  },
});

// ─── Public query ─────────────────────────────────────────────────────────────

export const listByProject = query({
  args: { projectId: v.id("projects"), organizationId: v.id("organizations") },
  handler: async (ctx, { projectId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    return ctx.db
      .query("reminders")
      .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(20);
  },
});

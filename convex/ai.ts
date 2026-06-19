import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { cancelFieldReminderByKey } from "./reminders";
import { buildChannelSendInfo } from "./lib/channelContext";
import { mergeFieldComponents, type CollectedFieldValue } from "./lib/fieldMerge";

// ─── Internal queries ─────────────────────────────────────────────────────────

// Consolidated context for the LangChain pipeline (aiChains.ts processGroupMessage).
// Returns everything the 4 chains need in a single round-trip.
export const getContextForProcessing = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    if (!message) return null;

    // Active projects in this group
    const activeProjects = await ctx.db
      .query("projects")
      .withIndex("byGroupChatId", (q) => q.eq("groupChatId", message.groupChatId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .take(10);

    // Each project: all stage states + stage templates (for field extractor)
    const projectsWithStages = await Promise.all(
      activeProjects.map(async (project) => {
        const stageStates = await ctx.db
          .query("projectStageStates")
          .withIndex("byProjectId", (q) => q.eq("projectId", project._id))
          .take(20);

        const stages = await Promise.all(
          stageStates.map(async (state) => {
            const template = await ctx.db.get(state.stageTemplateId);
            return {
              stateId: state._id,
              stageTemplateId: state.stageTemplateId,
              stageOrder: state.stageOrder,
              status: state.status,
              collectedFields: (state.collectedFields ?? {}) as Record<
                string,
                { value: unknown; confidence: number; extractedAt: number }
              >,
              template: template
                ? {
                    name: template.name,
                    description: template.description,
                    requiredFields: template.requiredFields,
                  }
                : null,
            };
          })
        );

        return {
          _id: project._id,
          name: project.name,
          workflowTemplateId: project.workflowTemplateId,
          stages,
        };
      })
    );

    // Channel send info for replies (LINE token or encrypted WhatsApp key)
    const group = await ctx.db.get(message.groupChatId);
    const channelContext = group ? await buildChannelSendInfo(ctx, group) : null;

    // Recent messages (last 30, oldest→newest) with project + role tags
    const raw = await ctx.db
      .query("messages")
      .withIndex("byGroupChatAndTimestamp", (q) =>
        q.eq("groupChatId", message.groupChatId)
      )
      .order("desc")
      .take(31);

    const projectsById = new Map(
      activeProjects.map((p) => [p._id as string, p.name])
    );

    const roleMappings = await ctx.db
      .query("groupChatRoleMappings")
      .withIndex("byGroupChatId", (q) =>
        q.eq("groupChatId", message.groupChatId)
      )
      .take(50);
    const roleByUserId = new Map<string, string>();
    for (const mapping of roleMappings) {
      const role = await ctx.db.get(mapping.roleId);
      const team = role?.teamId ? await ctx.db.get(role.teamId) : null;
      if (role) {
        roleByUserId.set(
          mapping.lineUserId,
          team ? `${role.name} (${team.name})` : role.name
        );
      }
    }

    const recentMessages = raw
      .filter((m) => m._id !== messageId)
      .slice(0, 30)
      .reverse()
      .map((m) => {
        const isBot = m.lineUserId.startsWith("system:");
        const role = isBot ? null : (roleByUserId.get(m.lineUserId) ?? "Customer");
        const projectName = m.projectId
          ? (projectsById.get(m.projectId as string) ?? null)
          : null;
        const senderTag = isBot ? "[Bot]" : `[${role}]`;
        const projectTag = projectName ? ` [Project: ${projectName}]` : "";
        return {
          text: m.text.slice(0, 300),
          tag: `${senderTag}${projectTag}`,
          projectId: (m.projectId ?? null) as Id<"projects"> | null,
        };
      });

    return {
      messageId,
      text: message.text,
      groupChatId: message.groupChatId,
      organizationId: message.organizationId,
      activeProjects: projectsWithStages,
      recentMessages,
      channelContext,
    };
  },
});

// Legacy individual context queries (still used by commitExtraction flow)

export const getExtractionContext = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    if (!message || !message.projectId) return null;

    const project = await ctx.db.get(message.projectId);
    if (!project || project.status !== "active") return null;

    const activeState = await ctx.db
      .query("projectStageStates")
      .withIndex("byProjectId", (q) => q.eq("projectId", message.projectId!))
      .filter((q) => q.eq(q.field("status"), "active"))
      .unique();
    if (!activeState) return null;

    const stageTemplate = await ctx.db.get(activeState.stageTemplateId);
    if (!stageTemplate) return null;

    const existingExtraction = await ctx.db
      .query("messageExtractions")
      .withIndex("byMessageId", (q) => q.eq("messageId", messageId))
      .unique();

    const collectedFields = (activeState.collectedFields ?? {}) as Record<
      string,
      { value: unknown; confidence: number }
    >;
    const allFields = stageTemplate.requiredFields;
    const missingFields = allFields.filter(
      (f) => f.isRequired && !(f.key in collectedFields)
    );

    return {
      message: {
        _id: message._id,
        text: message.text,
        organizationId: message.organizationId,
        projectId: message.projectId,
        groupChatId: message.groupChatId,
      },
      project: {
        _id: project._id,
        name: project.name,
        organizationId: project.organizationId,
      },
      activeState: {
        _id: activeState._id,
        stageTemplateId: activeState.stageTemplateId,
        collectedFields,
      },
      stageTemplate: {
        _id: stageTemplate._id,
        name: stageTemplate.name,
        description: stageTemplate.description,
        requiredFields: stageTemplate.requiredFields,
      },
      existingExtraction: !!existingExtraction,
      allFields,
      missingFields,
    };
  },
});

export const getGroupLineContext = internalQuery({
  args: {
    groupChatId: v.id("groupChats"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { groupChatId, organizationId }) => {
    const group = await ctx.db.get(groupChatId);
    if (!group) return null;
    const org = await ctx.db.get(organizationId);
    if (!org) return null;
    return {
      lineGroupId: group.lineGroupId,
      lineAccessToken: org.lineChannelAccessToken ?? null,
    };
  },
});

export const getRecentGroupMessages = internalQuery({
  args: {
    groupChatId: v.id("groupChats"),
    excludeMessageId: v.id("messages"),
  },
  handler: async (ctx, { groupChatId, excludeMessageId }) => {
    const raw = await ctx.db
      .query("messages")
      .withIndex("byGroupChatAndTimestamp", (q) =>
        q.eq("groupChatId", groupChatId)
      )
      .order("desc")
      .take(25);

    const truncate = (text: string, maxWords: number) => {
      const words = text.trim().split(/\s+/);
      return words.length > maxWords
        ? words.slice(0, maxWords).join(" ") + "…"
        : text;
    };

    const projectIds = [
      ...new Set(
        raw
          .map((m) => m.projectId)
          .filter((id): id is Id<"projects"> => !!id)
      ),
    ];
    const projectsById = new Map<string, string>();
    for (const id of projectIds) {
      const p = await ctx.db.get(id);
      if (p) projectsById.set(id as string, p.name);
    }

    const roleMappings = await ctx.db
      .query("groupChatRoleMappings")
      .withIndex("byGroupChatId", (q) => q.eq("groupChatId", groupChatId))
      .take(50);
    const roleByUserId = new Map<string, string>();
    for (const mapping of roleMappings) {
      const role = await ctx.db.get(mapping.roleId);
      const team = role?.teamId ? await ctx.db.get(role.teamId) : null;
      if (role) {
        const label = team ? `${role.name} (${team.name})` : role.name;
        roleByUserId.set(mapping.lineUserId, label);
      }
    }

    return raw
      .filter((m) => m._id !== excludeMessageId)
      .slice(0, 20)
      .reverse()
      .map((m) => {
        const isBot = m.lineUserId.startsWith("system:");
        const role = isBot
          ? null
          : (roleByUserId.get(m.lineUserId) ?? "Customer");
        const projectName = m.projectId
          ? (projectsById.get(m.projectId as string) ?? null)
          : null;
        const senderTag = isBot ? "[Bot]" : `[${role}]`;
        const projectTag = projectName ? ` [${projectName}]` : "";
        return {
          text: truncate(m.text, 50),
          tag: `${senderTag}${projectTag}`,
        };
      });
  },
});

// ─── Internal mutations ───────────────────────────────────────────────────────

export const commitExtraction = internalMutation({
  args: {
    messageId: v.id("messages"),
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    stageStateId: v.id("projectStageStates"),
    stageId: v.id("workflowStageTemplates"),
    allExtractedFields: v.array(
      v.object({
        fieldKey: v.string(),
        value: v.string(),
        confidence: v.number(),
      })
    ),
    validFields: v.array(
      v.object({
        fieldKey: v.string(),
        value: v.string(),
        confidence: v.number(),
      })
    ),
    modelUsed: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    processingMs: v.number(),
    isUpdate: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messageExtractions", {
      messageId: args.messageId,
      organizationId: args.organizationId,
      projectId: args.projectId,
      stageId: args.stageId,
      extractedFields: args.allExtractedFields,
      modelUsed: args.modelUsed,
      promptTokens: args.promptTokens,
      completionTokens: args.completionTokens,
      processingMs: args.processingMs,
      createdAt: Date.now(),
    });

    if (args.validFields.length > 0) {
      const state = await ctx.db.get(args.stageStateId);
      if (state) {
        const existing = (state.collectedFields ?? {}) as Record<
          string,
          { value: string; extractedAt: number; confidence: number }
        >;
        const updated = { ...existing };
        for (const field of args.validFields) {
          const prev = existing[field.fieldKey];
          if (!prev) {
            updated[field.fieldKey] = {
              value: field.value,
              extractedAt: Date.now(),
              confidence: field.confidence,
            };
          } else if (args.isUpdate) {
            updated[field.fieldKey] = {
              value: field.value,
              extractedAt: Date.now(),
              confidence: field.confidence,
            };
          } else if (prev.confidence < field.confidence) {
            updated[field.fieldKey] = {
              value: field.value,
              extractedAt: Date.now(),
              confidence: field.confidence,
            };
          }
        }
        await ctx.db.patch(args.stageStateId, { collectedFields: updated });
        for (const field of args.validFields) {
          await cancelFieldReminderByKey(ctx, args.stageStateId, field.fieldKey);
        }
      }
    }

    await ctx.db.patch(args.messageId, { processingStatus: "complete" });
  },
});

// Also commit for the new LangChain flow — same logic, accepts intent + stage target
export const commitExtractionForStage = internalMutation({
  args: {
    messageId: v.id("messages"),
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    stageStateId: v.id("projectStageStates"),
    stageId: v.id("workflowStageTemplates"),
    fields: v.array(
      v.object({
        fieldKey: v.string(),
        components: v.array(
          v.object({
            subKey: v.string(),
            subLabel: v.string(),
            value: v.string(),
            confidence: v.number(),
          })
        ),
      })
    ),
    isUpdate: v.boolean(),
    intent: v.union(
      v.literal("stage_filling"),
      v.literal("product_query"),
      v.literal("hybrid"),
      v.literal("other")
    ),
  },
  handler: async (ctx, args) => {
    // Update message intent
    await ctx.db.patch(args.messageId, {
      processingStatus: "complete",
      intent: args.intent,
      projectId: args.projectId,
    });

    if (args.fields.length === 0) return;

    // Create extraction record (flattened — one row per field, joining components for display)
    await ctx.db.insert("messageExtractions", {
      messageId: args.messageId,
      organizationId: args.organizationId,
      projectId: args.projectId,
      stageId: args.stageId,
      extractedFields: args.fields.map((f) => ({
        fieldKey: f.fieldKey,
        value: f.components.map((c) => c.value).join(", "),
        confidence: Math.min(...f.components.map((c) => c.confidence)),
      })),
      modelUsed: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      promptTokens: 0,
      completionTokens: 0,
      processingMs: 0,
      createdAt: Date.now(),
    });

    const state = await ctx.db.get(args.stageStateId);
    if (!state) return;

    const existing = (state.collectedFields ?? {}) as Record<string, CollectedFieldValue>;
    const updated = { ...existing };
    const now = Date.now();
    for (const field of args.fields) {
      updated[field.fieldKey] = mergeFieldComponents(existing[field.fieldKey], field.components, now);
      await cancelFieldReminderByKey(ctx, args.stageStateId, field.fieldKey);
    }
    await ctx.db.patch(args.stageStateId, { collectedFields: updated });
  },
});

export const markMessageComplete = internalMutation({
  args: {
    messageId: v.id("messages"),
    intent: v.optional(
      v.union(
        v.literal("stage_filling"),
        v.literal("product_query"),
        v.literal("hybrid"),
        v.literal("other")
      )
    ),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, { messageId, intent, projectId }) => {
    const msg = await ctx.db.get(messageId);
    if (!msg) return;
    await ctx.db.patch(messageId, {
      processingStatus: "complete",
      ...(intent ? { intent } : {}),
      ...(projectId ? { projectId } : {}),
    });
  },
});

export const markMessageFailed = internalMutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    await ctx.db.patch(messageId, { processingStatus: "failed" });
  },
});

export const storeBotMessage = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
    text: v.string(),
    timestamp: v.number(),
  },
  handler: async (ctx, { organizationId, groupChatId, text, timestamp }) => {
    await ctx.db.insert("messages", {
      organizationId,
      groupChatId,
      lineMessageId: `bot_${groupChatId}_${timestamp}`,
      lineUserId: "system:bot",
      text,
      messageType: "other",
      timestamp,
      processingStatus: "complete",
      routingMethod: "manual",
    });
  },
});

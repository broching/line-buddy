import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { paymentAttemptSchemaValidator } from "./paymentAttemptTypes";

export default defineSchema({
  // ─── Users (synced from Clerk) ─────────────────────────────────────────────
  users: defineTable({
    name: v.string(),
    externalId: v.string(), // Clerk user ID (JWT subject)
    email: v.optional(v.string()),
  })
    .index("byExternalId", ["externalId"])
    .index("byEmail", ["email"]),

  paymentAttempts: defineTable(paymentAttemptSchemaValidator)
    .index("byPaymentId", ["payment_id"])
    .index("byUserId", ["userId"])
    .index("byPayerUserId", ["payer.user_id"]),

  // ─── Organizations ──────────────────────────────────────────────────────────
  organizations: defineTable({
    name: v.string(),
    slug: v.string(), // URL-safe unique identifier
    ownerId: v.id("users"),
    lineChannelAccessToken: v.optional(v.string()), // encrypted
    lineChannelSecret: v.optional(v.string()), // encrypted
    planId: v.string(), // Clerk billing plan slug
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("bySlug", ["slug"])
    .index("byOwnerId", ["ownerId"]),

  // ─── Memberships (dashboard access — Clerk users who can use the CRM) ────────
  memberships: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    isAdmin: v.optional(v.boolean()), // true = can manage org settings; undefined treated as true for original owner
    roles: v.optional(v.array(v.string())), // legacy field — ignore, kept for schema compat with existing documents
    invitedBy: v.id("users"),
    joinedAt: v.number(),
    isActive: v.boolean(),
  })
    .index("byOrganizationId", ["organizationId"])
    .index("byUserId", ["userId"])
    .index("byOrgAndUser", ["organizationId", "userId"]),

  // ─── Teams (belong to an org; each group chat will have instances of these) ──
  // Default teams created on org setup: "Deye Team" and "Customer Team"
  teams: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(), // e.g. "Deye Team", "Customer Team"
    description: v.optional(v.string()),
    isDefault: v.boolean(),
  }).index("byOrganizationId", ["organizationId"]),

  // ─── Roles (belong to a team; user-defined within the org) ─────────────────
  // e.g. Owner, Business Analyst, Designer, Engineer under "Deye Team"
  roles: defineTable({
    organizationId: v.id("organizations"),
    teamId: v.optional(v.id("teams")), // optional for legacy documents without a team
    name: v.string(), // e.g. "Owner", "Business Analyst", "Engineer"
    description: v.optional(v.string()),
    isDefault: v.boolean(),
    permissions: v.optional(v.array(v.string())), // legacy field from old schema
  })
    .index("byOrganizationId", ["organizationId"])
    .index("byTeamId", ["teamId"]),

  // ─── Group Chat Role Mappings ────────────────────────────────────────────────
  // Maps a LINE user in a specific group chat to a role (e.g. John → Owner / Deye Team)
  groupChatRoleMappings: defineTable({
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
    lineUserId: v.string(), // LINE user ID
    roleId: v.id("roles"),
    teamId: v.id("teams"),
    mappedBy: v.id("users"), // dashboard user who created this mapping
    mappedAt: v.number(),
  })
    .index("byGroupChatId", ["groupChatId"])
    .index("byGroupChatAndLineUser", ["groupChatId", "lineUserId"])
    .index("byOrganizationId", ["organizationId"]),

  // ─── Connect Tokens (ephemeral, for /connect LINE flow) ─────────────────────
  connectTokens: defineTable({
    token: v.string(), // short random string shown to user
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    expiresAt: v.number(), // unix ms, TTL ~10 minutes
    consumed: v.boolean(),
  })
    .index("byToken", ["token"])
    .index("byOrganizationId", ["organizationId"]),

  // ─── Group Chats (connected LINE groups) ────────────────────────────────────
  groupChats: defineTable({
    organizationId: v.id("organizations"),
    lineGroupId: v.string(), // LINE group/room ID
    displayName: v.string(),
    pictureUrl: v.optional(v.string()),
    memberCount: v.optional(v.number()),
    isActive: v.boolean(),
    connectedAt: v.number(),
    connectedBy: v.optional(v.id("users")), // optional: set when connected via dashboard token flow
  })
    .index("byOrganizationId", ["organizationId"])
    .index("byLineGroupId", ["lineGroupId"]), // must be globally unique for webhook routing

  // ─── Workflow Templates ─────────────────────────────────────────────────────
  workflowTemplates: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    teamIds: v.optional(v.array(v.id("teams"))), // teams involved in this workflow
    isArchived: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byOrganizationId", ["organizationId"]),

  // ─── Workflow Stage Templates ───────────────────────────────────────────────
  workflowStageTemplates: defineTable({
    templateId: v.id("workflowTemplates"),
    organizationId: v.id("organizations"), // denormalized for tenant scoping
    order: v.number(), // 1-based position
    name: v.string(),
    description: v.optional(v.string()),
    requiredFields: v.array(
      v.object({
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
        // Per-field reminder config
        responsibleRoleIds: v.optional(v.array(v.id("roles"))),
        reminderDelayMs: v.optional(v.number()),
        reminderMessage: v.optional(v.string()),
        maxReminderCount: v.optional(v.number()),
      })
    ),
    stageActions: v.optional(v.array(
      v.object({
        id: v.string(),
        type: v.union(v.literal("group_message"), v.literal("pm_message")),
        message: v.string(),
        roleIds: v.array(v.id("roles")),
      })
    )),
    responsibleRoleId: v.optional(v.id("roles")),
    reminderDelayMs: v.number(), // 0 = no reminder
    completionRule: v.union(
      v.literal("all_required_fields"),
      v.literal("manual"),
      v.literal("custom")
    ),
    skipCondition: v.optional(v.string()), // serialized boolean rule expression
  })
    .index("byTemplateId", ["templateId"])
    .index("byOrganizationId", ["organizationId"])
    .index("byTemplateAndOrder", ["templateId", "order"]),

  // ─── Projects ───────────────────────────────────────────────────────────────
  projects: defineTable({
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
    workflowTemplateId: v.id("workflowTemplates"),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("archived"),
      v.literal("paused")
    ),
    currentStageId: v.optional(v.id("workflowStageTemplates")),
    currentStageOrder: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("byOrganizationId", ["organizationId"])
    .index("byGroupChatId", ["groupChatId"])
    .index("byOrganizationAndStatus", ["organizationId", "status"]),

  // ─── Project Stage States ───────────────────────────────────────────────────
  projectStageStates: defineTable({
    projectId: v.id("projects"),
    organizationId: v.id("organizations"), // denormalized for tenant scoping
    stageTemplateId: v.id("workflowStageTemplates"),
    stageOrder: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("skipped")
    ),
    // Dynamic field map: Record<fieldKey, {value, extractedAt, confidence, sourceMessageId?}>
    collectedFields: v.any(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    skippedAt: v.optional(v.number()),
    skippedReason: v.optional(v.string()),
    activeReminderJobId: v.optional(v.string()),
    reminderSentCount: v.number(),
    fieldReminderJobs: v.optional(v.any()), // Record<fieldKey, {jobId:string,sentCount:number}>
  })
    .index("byProjectId", ["projectId"])
    .index("byProjectAndStageOrder", ["projectId", "stageOrder"])
    .index("byOrganizationId", ["organizationId"]),

  // ─── Pending message groups (10s batching window before AI processing) ────────
  pendingMessageGroups: defineTable({
    groupChatId: v.id("groupChats"),
    organizationId: v.id("organizations"),
    lineUserId: v.string(),
    messageIds: v.array(v.id("messages")),
    replyToken: v.optional(v.string()),
    quoteToken: v.optional(v.string()),
    scheduledJobId: v.optional(v.id("_scheduled_functions")),
  }).index("byGroupAndUser", ["groupChatId", "lineUserId"]),

  // ─── Messages ───────────────────────────────────────────────────────────────
  messages: defineTable({
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
    projectId: v.optional(v.id("projects")), // null until routed
    lineMessageId: v.string(), // LINE's message ID (dedup key)
    lineUserId: v.string(), // LINE sender ID
    memberUserId: v.optional(v.id("users")), // mapped if sender is org member
    sentByName: v.optional(v.string()), // dashboard user who sent this bot message
    text: v.string(),
    storageId: v.optional(v.id("_storage")), // for image/file messages
    messageType: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("file"),
      v.literal("sticker"),
      v.literal("other")
    ),
    timestamp: v.number(),
    routingMethod: v.optional(
      v.union(
        v.literal("explicit_tag"),
        v.literal("user_context"),
        v.literal("ai"),
        v.literal("manual")
      )
    ),
    processingStatus: v.union(
      v.literal("pending"),
      v.literal("extracting"),
      v.literal("complete"),
      v.literal("failed")
    ),
    intent: v.optional(v.union(
      v.literal("stage_filling"),
      v.literal("product_query"),
      v.literal("hybrid"),
      v.literal("other"),
    )),
    aiTraceId: v.optional(v.id("aiTraces")),
  })
    .index("byLineMessageId", ["lineMessageId"])
    .index("byGroupChatId", ["groupChatId"])
    .index("byProjectId", ["projectId"])
    .index("byOrganizationId", ["organizationId"])
    .index("byGroupChatAndTimestamp", ["groupChatId", "timestamp"]),

  // ─── Message Extractions (AI results) ──────────────────────────────────────
  messageExtractions: defineTable({
    messageId: v.id("messages"),
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    stageId: v.id("workflowStageTemplates"),
    extractedFields: v.array(
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
    createdAt: v.number(),
  })
    .index("byMessageId", ["messageId"])
    .index("byProjectId", ["projectId"]),

  // ─── Reminders ──────────────────────────────────────────────────────────────
  reminders: defineTable({
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    stageStateId: v.id("projectStageStates"),
    scheduledFor: v.number(),
    convexJobId: v.optional(v.string()),
    status: v.union(
      v.literal("scheduled"),
      v.literal("sent"),
      v.literal("cancelled"),
      v.literal("failed")
    ),
    sentAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    cancelReason: v.optional(v.string()),
    // field-level reminder metadata (null = stage-level reminder)
    fieldKey: v.optional(v.string()),
    fieldLabel: v.optional(v.string()),
    // message text sent to LINE
    reminderMessage: v.optional(v.string()),
    // roles to mention (manual reminders)
    roleIds: v.optional(v.array(v.id("roles"))),
  })
    .index("byProjectId", ["projectId"])
    .index("byStageStateId", ["stageStateId"])
    .index("byOrganizationId", ["organizationId"]),

  // ─── Audit Logs (immutable append-only) ─────────────────────────────────────
  auditLogs: defineTable({
    organizationId: v.id("organizations"),
    actorId: v.optional(v.id("users")),
    actorType: v.union(
      v.literal("user"),
      v.literal("bot"),
      v.literal("system")
    ),
    eventType: v.string(), // e.g. "project.stage.advanced"
    entityType: v.string(), // e.g. "project"
    entityId: v.string(),
    payload: v.any(),
    timestamp: v.number(),
  })
    .index("byOrganizationId", ["organizationId"])
    .index("byOrganizationAndTimestamp", ["organizationId", "timestamp"])
    .index("byEntityId", ["entityId"]),

  // ─── Knowledge Sources (org-level RAG documents) ────────────────────────────
  knowledgeSources: defineTable({
    organizationId: v.id("organizations"),
    title: v.string(),
    description: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    totalChunks: v.number(),
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("byOrganizationId", ["organizationId"]),

  // ─── Template ↔ Knowledge Source links ──────────────────────────────────────
  templateKnowledgeSources: defineTable({
    organizationId: v.id("organizations"),
    templateId: v.id("workflowTemplates"),
    knowledgeSourceId: v.id("knowledgeSources"),
    isEnabled: v.boolean(),
  })
    .index("byTemplateId", ["templateId"])
    .index("byKnowledgeSourceId", ["knowledgeSourceId"]),

  // ─── Template Documents (RAG chunk storage) ──────────────────────────────────
  templateDocuments: defineTable({
    organizationId: v.id("organizations"),
    templateId: v.optional(v.id("workflowTemplates")), // legacy; use knowledgeSourceId for new uploads
    knowledgeSourceId: v.optional(v.id("knowledgeSources")),
    title: v.string(),
    content: v.string(),
    embedding: v.array(v.number()),
    storageId: v.optional(v.id("_storage")),
    chunkIndex: v.number(),
    totalChunks: v.number(),
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("byTemplateId", ["templateId"])
    .index("byOrganizationId", ["organizationId"])
    .index("byKnowledgeSourceId", ["knowledgeSourceId"])
    .vectorIndex("byEmbedding", {
      vectorField: "embedding",
      dimensions: 3072,
      filterFields: ["organizationId"],
    }), // gemini-embedding-001 produces 3072-dim vectors

  // ─── AI Traces (token usage + decision trace per processed message) ──────────
  aiTraces: defineTable({
    messageId: v.id("messages"),
    organizationId: v.id("organizations"),
    steps: v.array(v.object({
      name: v.string(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      durationMs: v.number(),
      status: v.union(v.literal("success"), v.literal("skipped"), v.literal("error")),
      details: v.string(),
      prompt: v.optional(v.string()),
    })),
    totalInputTokens: v.number(),
    totalOutputTokens: v.number(),
    totalDurationMs: v.number(),
    outcome: v.string(), // "stage_filled", "rag_answered", "clarification_sent", "no_action", "error"
    createdAt: v.number(),
  })
    .index("byMessageId", ["messageId"])
    .index("byOrganizationId", ["organizationId"]),

  // ─── User LINE Profiles (LINE user → org member mapping) ────────────────────
  userLineProfiles: defineTable({
    organizationId: v.id("organizations"),
    lineUserId: v.string(),
    userId: v.optional(v.id("users")), // mapped org member, if known
    displayName: v.string(),
    pictureUrl: v.optional(v.string()),
    lastSeenAt: v.number(),
  })
    .index("byLineUserId", ["lineUserId"])
    .index("byOrganizationId", ["organizationId"])
    .index("byOrganizationAndLineUserId", ["organizationId", "lineUserId"]),
});

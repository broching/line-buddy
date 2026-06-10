# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Commands

```bash
npm run dev          # Next.js dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript check (no dedicated test suite)
npx convex dev       # Run Convex backend (separate terminal)
```

Environment variables go in `.env.local` (copy from `.env.example`). `GEMINI_API_KEY`, `CLERK_WEBHOOK_SECRET`, and `CREDENTIALS_ENCRYPTION_KEY` must also be set in the Convex dashboard as environment variables — they're not available to Next.js.

## Architecture

Line Buddy is a LINE Messaging API CRM. Organizations connect their LINE group chats, define workflow templates with stages and required fields, and an AI pipeline extracts data from conversations to drive projects through those stages.

### Request flow

```
LINE Group Chat
  │
  ▼
POST /webhooks/line  (Convex HTTP action — convex/lineWebhook.ts)
  │  verifies X-LINE-SIGNATURE, stores message via api.messages.storeFromWebhook
  │  schedules processMessageGroup after 10s batching window
  ▼
internal.aiChains.processMessageGroup  ("use node" — convex/aiChains.ts)
  │  1. classifyIntent    → stage_filling | product_query | hybrid | other
  │  2. routeToProject    → which project does this message refer to?
  │  3. extractFields     → which fields does it fill (any stage, not just active)?
  │  4. answerWithRAG     → product Q&A from embedded template documents
  ▼
internal.ai.commitExtraction  (convex/ai.ts — V8 runtime)
  │  writes collectedFields, checks stage completion
  ▼
internal.workflow.*  (convex/workflow.ts)
     advances/completes stages, schedules reminders
```

### Convex runtime split

Convex functions run in either V8 or Node.js. This matters because they cannot freely call each other:

- **V8 (default)**: `queries`, `mutations`, all files without `"use node"`. Can call other V8 functions directly.
- **Node.js**: Files with `"use node"` at the top — `convex/aiChains.ts`, `convex/templateDocumentsNode.ts`. Must call V8 code via `ctx.runQuery` / `ctx.runMutation` / `ctx.runAction`. Cannot export `query` or `mutation` (only `internalAction`).

The Convex HTTP action in `convex/lineWebhook.ts` runs in V8. It calls the Node.js AI pipeline via `ctx.scheduler.runAfter`.

### Key Convex modules

| File | Responsibility |
|------|---------------|
| `convex/schema.ts` | Single source of truth for all table definitions and indexes |
| `convex/http.ts` | HTTP router — LINE webhook + Clerk webhook |
| `convex/lineWebhook.ts` | LINE event handling: join/leave/text/media/sticker |
| `convex/aiChains.ts` | LangChain pipeline (`"use node"`): intent → routing → RAG → extraction |
| `convex/ai.ts` | V8-side AI helpers: `getContextForProcessing`, `commitExtraction`, `storeBotMessage` |
| `convex/workflow.ts` | Stage advancement logic, `initializeProjectStages`, `advanceToNextStage` |
| `convex/reminders.ts` | Field-level and stage-level reminder scheduling, send actions, manual scheduling |
| `convex/projects.ts` | Project CRUD, `advanceStage`, `skipStage`, `pause`/`resume`/`complete` |
| `convex/projectStageStates.ts` | Per-stage state CRUD and field updates |
| `convex/messages.ts` | `storeFromWebhook`, `chatFeedByGroupPaginated`, `storeBotPush` |
| `convex/pendingMessageGroups.ts` | 10-second message batching before AI fires |
| `convex/templateDocuments.ts` | RAG document CRUD + `searchSimilar` (V8 vector search) |
| `convex/templateDocumentsNode.ts` | RAG document ingestion: PDF parsing + embeddings (`"use node"`) |
| `convex/lib/auth.ts` | `requireMembership`, `requireUser`, `requireAdmin` — used by all public functions |
| `convex/lib/lineApi.ts` | LINE API helpers: `verifyLineSignature`, `replyMessage`, `getGroupMemberProfile` |

### Authentication pattern

Every public Convex `query` and `mutation` that touches org data calls `requireMembership(ctx, organizationId)` from `convex/lib/auth.ts`. Internal functions (prefixed `internal.`) skip auth — they're not callable from the client.

### Next.js dashboard

`app/dashboard/[orgSlug]/` contains the main dashboard. The `[orgSlug]` segment is the organization's URL slug resolved via `api.organizations.get`. Each sub-route is a page:

- `groups/[groupId]/page.tsx` — group chat view with split panel: chat feed (left) + project cards (right). Project cards have Stages / Roles / Reminders tabs.
- `projects/page.tsx` — list and kanban views of all projects
- `templates/[templateId]/edit/page.tsx` — workflow template editor with Stages and Documents (RAG) tabs
- `settings/line/page.tsx` — LINE credentials per org

### Data model relationships

```
Organization
  ├─ Teams → Roles
  ├─ GroupChats  ←──────────────────────── LINE group IDs (unique globally for webhook routing)
  │    └─ GroupChatRoleMappings           (lineUserId → roleId per group)
  ├─ WorkflowTemplates
  │    └─ WorkflowStageTemplates          (ordered stages with requiredFields)
  │         └─ templateDocuments          (RAG chunks with 768-dim embeddings)
  └─ Projects  (groupChat + workflowTemplate)
       └─ ProjectStageStates              (one per stage; holds collectedFields, reminderJobs)
            └─ Reminders                  (scheduled/sent/cancelled; field-level or stage-level)
```

### AI pipeline details

`convex/aiChains.ts` uses `ChatGoogleGenerativeAI` (Gemini 2.5 Flash Lite by default). Token usage is tracked via `handleLLMEnd` — this is the only callback that fires for `ChatGoogleGenerativeAI`; `handleChatModelEnd` does NOT fire despite the class name. Do not implement both or you'll get double-counting. Prompt text is captured and stored in `aiTraces.steps[].prompt` for debugging.

RAG uses Convex native vector search: embeddings (768-dim, `gemini-embedding-001`) are stored in `templateDocuments.embedding`. Vector search runs in V8 via `internal.templateDocuments.searchSimilar`; the Node.js action calls it with `ctx.runAction`.

### Reminder system

Two reminder types share the `reminders` table:
- **Stage-level**: one reminder per active stage (`reminders.ts: scheduleReminderForStage`)
- **Field-level**: one reminder per required field with `responsibleRoleIds + reminderDelayMs` configured (`reminders.ts: scheduleFieldRemindersForStage`). Tracked in `projectStageStates.fieldReminderJobs` as `Record<fieldKey, {jobId, sentCount, reminderId}>`.
- **Manual**: dashboard-created reminders via `api.reminders.scheduleManual`

When a stage advances, `cancelAllFieldRemindersForStage` must be called before scheduling new ones.

# LeadMighty — Functional Specification

**Version:** 2.0  
**Date:** June 2026  
**Stack:** Next.js 15 (App Router) · Convex · Clerk · gemini 3.1 Flash Lite · LangChain · Stripe

---

## 1. Product Overview

LeadMighty is a multi-tenant AI-powered CRM that runs inside LINE group chats. Organizations connect their LINE Official Account to group chats, define sales workflow templates with stages and required fields, and an AI pipeline automatically extracts structured data from conversations — advancing deals through the pipeline without any manual data entry.

**Core value proposition:** Sales teams already operate in LINE group chats. LeadMighty sits inside those chats, listens to every conversation, and keeps the CRM updated in real time.

---

## 2. User Roles & Permissions

### 2.1 Organization Roles

| Role | Capabilities |
|------|-------------|
| **Owner** | Full access. Only one per org. Manages billing, LINE credentials, and all settings. |
| **Admin** | Full access except billing ownership transfer and deleting the org. Can manage members and templates. |
| **Member** | Read-only access to dashboard. Cannot access Organization Settings or Billing pages. Cannot invite users. |

### 2.2 Access Enforcement

- Every public Convex query and mutation calls `requireMembership(ctx, organizationId)` before executing.
- The dashboard sidebar hides admin-only items (Settings, Billing) from members.
- The Organization Settings and Billing pages redirect members away at the page level via `useEffect` + `useRouter`.
- Internal Convex functions (prefixed `internal.`) bypass auth checks — they are not callable from the client.

### 2.3 LINE Roles (within a group chat)

Each LINE user in a connected group can be mapped to a **Role** (e.g. "Business Analyst", "Decision Maker") within a **Team** (e.g. "Deye Team", "Customer Team"). Roles are used for:
- Directing field-level reminder @mentions to the correct people.
- Tracking who is responsible for filling which CRM field.

---

## 3. Authentication

- Handled by **Clerk**. Users sign in with email/password or social login.
- Clerk organizations are synced to Convex via a webhook (`/webhooks/clerk`) that handles `organizationCreated`, `organizationUpdated`, `organizationMembership.*` events.
- JWT tokens carry `org_id` and `org_role` claims. Convex uses these for auth context.
- A Convex `users` record is created on first login.
- A user can belong to multiple organizations, each with its own role.

---

## 4. Landing Page

**Route:** `/`  
**File:** `app/(landing)/page.tsx`

### 4.1 Sections (in order)

1. **Hero** — Dark background with visible dot-grid pattern and top-center sunshine glare effect. Bold two-line headline ("Close more deals. / From LINE groups."). Badge, subtitle, primary CTA ("Get Started"), secondary CTA ("See How It Works"), and three trust badges ("Connect in minutes", "No code required", "Cancel anytime"). Tab switcher below with two demo panels:
   - **Group Chat tab** — Animated LINE group chat showing AI extracting fields from multi-participant conversations. Auto-cycles through group conversations.
   - **CRM Dashboard tab** — Animated CRM project view showing stage pipeline and AI-extracted fields staggering in. Project list sidebar allows switching between projects; each switch re-triggers the field animation.

2. **Features** — Section ID `#features`. Feature cards explaining the core value props.

3. **How It Works** — Section ID `#how-it-works`. Four-stage interactive demo:
   - Stage 1: **Template Builder** — Shows defining workflow stages and required fields.
   - Stage 2: **Group Chats** — Shows connected groups with participant avatars and the animated "Connect" button flow (idle → connecting → connected ✓).
   - Stage 3: **AI Chat** — Shows real-time extraction scanning indicator and field values populating.
   - Stage 4: **Project Pipeline** — Kanban-style board auto-advancing a project card between stages.

4. **Testimonials** — Section ID `#testimonials`.

5. **Pricing** — Section ID `#pricing`. Clerk-managed pricing table (`<CustomClerkPricing />`). Plans include AI credit allowances. No free trial; credit card required.

6. **Call to Action** — Final CTA block.

7. **FAQ** — Section ID `#faq`. Accordion with animated expand/collapse (CSS `max-height` transition, 350ms cubic-bezier).

8. **Footer** — Logo, section scroll links (home page) or hash href links (other pages), Privacy Policy and Terms of Service links, copyright, social links (X/Twitter, LinkedIn).

### 4.2 Legal Pages

- `/privacy` — Privacy Policy. 8 sections with sticky desktop ToC. Indigo color scheme.
- `/terms` — Terms of Service. 10 sections with sticky desktop ToC. Violet color scheme.

### 4.3 Navigation

- Sticky header with logo, nav links, dark/light mode toggle, sign-in/sign-up buttons.
- All section links use `scrollIntoView({ behavior: 'smooth' })` on the home page; hash links on other pages.

---

## 5. Organization Setup

### 5.1 Creating an Organization

1. User signs up via Clerk.
2. An organization is created — either via the Clerk dashboard or via LeadMighty's own `api.organizations.create` mutation.
3. Convex `create` generates a unique URL slug, seeds two default teams with default roles, adds the creator as `owner`, and initializes a free billing record.

**Default teams seeded on creation:**

| Team | Type | Roles |
|------|------|-------|
| Deye Team | Internal | Owner, Business Analyst, Designer, Engineer (default), Project Manager |
| Customer Team | Client | Decision Maker, Technical Contact (default), Site Contact (default) |

### 5.2 Organization Settings (`/settings/organization`)

- Edit organization name and profile picture (uploaded to Convex storage).
- Manage members: view list, invite by email (Clerk invitation), change roles, remove members.
- Seat limit enforced: adding members beyond the plan quota is disabled in both the UI and backend.
- Owner/Admin only; members are redirected away.

### 5.3 General Settings (`/settings/general`)

- Org-level configuration not covered by other settings pages.

---

## 6. LINE Integration

### 6.1 Channel Configuration (`/settings/line`)

Admins enter their LINE Official Account credentials:
- **Channel Access Token** (encrypted with `CREDENTIALS_ENCRYPTION_KEY` before storage)
- **Channel Secret** (encrypted)

The webhook URL to enter in the LINE Developers Console is displayed on the page.

### 6.2 Webhook Endpoint

**Route:** `POST /webhooks/line` (Convex HTTP action, V8 runtime)

1. Verifies `X-LINE-SIGNATURE` header using HMAC-SHA256 with the channel secret.
2. Looks up the organization by matching the channel credentials.
3. Handles LINE events:
   - `join` — Records the group chat (creates `groupChats` record).
   - `leave` — Marks group chat as inactive.
   - `message.text` — Stores message via `api.messages.storeFromWebhook`; schedules `internal.aiChains.processMessageGroup` after a 10-second batching window.
   - `message.image/file` — Stores with `_storage` reference.
   - `message.sticker` — Stored as type `sticker`.
4. Returns 200 immediately (LINE requires < 1s response).

### 6.3 Group Chat Connection Flow

Groups connect automatically when the LINE bot joins a group that has credentials matching a registered organization.

Alternatively, a **connect token flow** is available:
1. Admin generates a short token from the dashboard.
2. Token is shared in the LINE group chat.
3. Bot recognizes the token message and links the group to the organization.

### 6.4 Connected Groups (`/groups`)

Lists all connected LINE group chats for the organization:
- Group picture, display name, member count.
- Connection status (active / inactive).
- Active project count and last message preview.
- Clicking a group opens the Group Chat detail view.

---

## 7. Workflow Templates

**Route:** `/templates`  
**Edit route:** `/templates/[templateId]/edit`

### 7.1 Template Structure

A `workflowTemplate` defines a sales process. It contains ordered `workflowStageTemplates`.

**Each stage contains:**

| Field | Description |
|-------|-------------|
| Name + Description | Human-readable stage identity |
| Required Fields | Array of typed fields the AI must fill |
| Completion Rule | `all_required_fields` \| `manual` \| `custom` |
| Responsible Role | Default role for stage-level reminders |
| Reminder Delay | ms after stage activation before first stage reminder fires |
| Stage Actions | Messages auto-sent on stage completion (to group or to role via PM) |
| Skip Condition | Boolean expression for conditional stage skipping |

**Each required field contains:**

| Field | Description |
|-------|-------------|
| key / label | Machine key and human label |
| type | `text` \| `number` \| `date` \| `select` \| `file` |
| options | For `select` type |
| isRequired | Whether absence blocks stage completion |
| instructions | AI extraction hint |
| examples | Sample values for AI context |
| responsibleRoleIds | Roles to @mention for this field's reminder |
| reminderDelayMs | Delay before field reminder fires |
| reminderMessage | Custom LINE message for field reminder |
| maxReminderCount | Max times to re-send field reminder |

### 7.2 Template Editor UI

The editor has two tabs:

**Stages tab:**
- Drag-and-drop stage reordering.
- Add/edit/delete stages.
- Per-stage field configuration with all options above.
- Visual completion rule selector.

**Documents tab (RAG):**
- Upload PDF or plain text files as knowledge source documents.
- Files are chunked, embedded (Gemini `gemini-embedding-001`, 3072 dimensions), and stored.
- Progress indicator during embedding.
- List of uploaded documents with title, chunk count, date, and delete button.
- Linked documents are searched during AI product query handling for that template.

### 7.3 Knowledge Sources (`/knowledge-sources`)

Organization-level RAG document library. Documents here can be linked to any template via `templateKnowledgeSources`. This allows sharing product FAQs across multiple workflow templates without re-uploading.

---

## 8. Projects

### 8.1 What Is a Project?

A project is an instance of a workflow template running inside a specific LINE group chat. It tracks one deal or case through the template's stages.

**Project status values:** `active` · `paused` · `completed` · `archived`

### 8.2 Creating a Project

**From dashboard:** Any admin or member with write access can create a project via `/projects` or `/groups/[groupId]`. Requires selecting a workflow template.

**From LINE (bot command):** `/new-project [name]` in a connected group chat. The bot creates the project and links it to that group.

On creation, `workflow.initializeProjectStages` runs immediately:
1. Creates one `projectStageState` per template stage.
2. Sets the first stage to `active`, all others to `pending`.
3. Schedules the first stage's reminder job (if `reminderDelayMs > 0`).
4. Schedules all field-level reminders for the active stage.

### 8.3 Stage Progression

**Automatic advance:** When the AI fills all required fields for the active stage (and `completionRule = all_required_fields`), `workflow.evaluateAndAdvance` is called. It:
1. Marks the current stage `completed`.
2. Cancels all field reminders for the completed stage.
3. Finds the next `pending` stage, sets it to `active`.
4. Fires any `stageActions` for the completed stage (sends LINE messages).
5. Schedules reminders for the new active stage.
6. Writes audit log entries.

**Manual advance:** Dashboard "Advance Stage" button calls `api.projects.advanceStage`. Same logic as above.

**Skip stage:** Dashboard "Skip" calls `api.projects.skipStage`. Marks stage `skipped` and activates the next pending one.

### 8.4 Project Detail (`/projects/[projectId]`)

Full project view showing:
- Project metadata and current status.
- Stage timeline with completion indicators.
- Per-stage collected fields with confidence scores and source message links.
- Reminder history.
- AI trace log (token usage, decisions).
- Audit log for this project.

### 8.5 Projects List (`/projects`)

Two views:
- **List view** — Table with project name, group, template, stage, status, last activity.
- **Kanban view** — Columns per workflow stage, cards per project.

Filters: by status, by template, by group chat.

---

## 9. Group Chat View (`/groups/[groupId]`)

Split-panel layout:

**Left panel — Chat feed:**
- Real-time LINE message stream (paginated, newest at bottom).
- Each message shows sender name, avatar (colored by role), timestamp.
- Bot messages shown with robot icon.
- Processing status indicator per message (pending → extracting → complete).

**Right panel — Project cards:**
Each active project in this group has a card with three tabs:

**Stages tab:**
- Current stage highlighted with progress bar.
- All stages listed with status icons.
- Collected fields shown per stage.
- Manual Advance / Skip buttons.

**Roles tab:**
- Table of LINE group participants.
- Assign each participant to a Team + Role via dropdown.
- Changes update `groupChatRoleMappings` which affects future reminder targeting.

**Reminders tab:**
- List of scheduled, sent, and cancelled reminders for this project.
- Each reminder shows: type (field/stage/manual), scheduled time, status, message text preview.
- "Cancel" button for scheduled reminders.
- "Send Manual Reminder" — modal with message textarea and role selector for @mentions.

---

## 10. AI Processing Pipeline

**Entry point:** `internal.aiChains.processMessageGroup` (Convex Node.js action)

All message processing runs in the LangChain pipeline. The pipeline has four sequential steps:

### 10.1 Step 1 — Intent Classification

**Model:** gemini 3.1 Flash Lite  
**Input:** Message text, active project names, active stage field names, recent 30 messages with project tags.  
**Output:** `intent` ∈ `{ stage_filling | product_query | hybrid | other }`

Routes the message to either the RAG path or the extraction path.

### 10.2 Step 2a — Project Routing (stage_filling / hybrid)

**Model:** gemini 3.1 Flash Lite  
**Output:** `{ projectId: string | null, confidence: number, implicit: boolean, reasoning: string }`

Key behaviors:
- Explicit `#project-name` tags in messages are passed as text context (not pre-processed).
- Implicit references ("change that", "same one") are resolved using the 30-message history.
- If multiple projects are equally likely, returns `projectId: null` → bot sends clarification request to LINE.
- If `confidence < 0.6`, bot asks which project the message refers to.

### 10.3 Step 2b — RAG Answer (product_query / hybrid)

1. Embeds the question using `gemini-embedding-001` (3072 dimensions).
2. Calls `internal.templateDocuments.searchSimilar` (V8 vector search) via `ctx.runAction`.
3. Vector search returns top-5 closest chunks filtered by `organizationId`.
4. Injects chunks into LLM context, generates answer.
5. Sends answer as bot reply to LINE group.
6. Stores bot message in `messages` table.

### 10.4 Step 3 — Field Extraction

**Model:** gemini 3.1 Flash Lite  
**Input:** All stage templates for the routed project (active + completed), with current field values.  
**Output:** `{ stageKey, fields: [{key, value, confidence}], isUpdate: boolean }`

Key behaviors:
- Extracts fields for **any stage**, not just the active one.
- If `isUpdate = true` on a completed stage, calls `internal.projectStageStates.updateFieldFromAI` to retroactively update a past stage's field.
- If targeting the active stage, calls `internal.ai.commitExtraction`.

### 10.5 Step 4 — Commit Extraction (`internal.ai.commitExtraction`)

1. Writes extracted fields to `projectStageStates.collectedFields`.
2. Stores `messageExtraction` record (field values + confidence + token counts).
3. Calls `workflow.evaluateAndAdvance` — checks if stage is complete and auto-advances if so.
4. Cancels field-level reminders for any fields that were just filled.

### 10.6 Token Tracking

Every step in the pipeline uses `TokenTracker` (a `BaseCallbackHandler`) to count input/output tokens via `handleLLMEnd`. An `aiTrace` record is written per processed message containing:
- Per-step: name, inputTokens, outputTokens, durationMs, status, details, optional prompt text.
- Aggregate: totalInputTokens, totalOutputTokens, totalDurationMs.
- Outcome: `stage_filled` | `rag_answered` | `clarification_sent` | `no_action` | `error`.

Token usage is deducted from the organization's `orgBilling.creditsUsed`.

### 10.7 Message Batching

Before AI fires, messages are batched in a 10-second window using `pendingMessageGroups`. If a user sends multiple messages rapidly, they are processed together as a single group to reduce AI calls and preserve conversational context.

---

## 11. Reminder System

### 11.1 Field-Level Reminders

Configured per-field in the workflow template. When a stage becomes active:

1. `reminders.scheduleFieldRemindersForStage` creates a reminder record and schedules a Convex job per field (if `reminderDelayMs > 0`).
2. When the job fires, `reminders.sendFieldReminder`:
   - Loads field config, role mappings, and LINE user profiles for the group.
   - Builds a LINE `textV2` message with `@mention` substitution tags for each responsible role member found in the group.
   - Sends via LINE Reply/Push API.
   - Records sent count. If `sentCount < maxReminderCount`, schedules the next reminder.
3. When the field is filled, `cancelFieldReminderByKey` cancels the pending job.
4. When the stage advances, `cancelAllFieldRemindersForStage` cancels all remaining field jobs.

### 11.2 Stage-Level Reminders

One reminder per active stage, fired after `reminderDelayMs` from stage activation. Sends a summary of all unfilled required fields to the LINE group.

### 11.3 Manual Reminders

Dashboard users can create a manual reminder from the Reminders tab of a project card:
- Custom message text.
- Role selector for @mentions.
- Scheduled "send at" time.
- `api.reminders.scheduleManual` stores the reminder and schedules the job.
- Can be cancelled from the dashboard before it fires.

### 11.4 Reminder Status Lifecycle

`scheduled` → `sent` | `failed` | `cancelled`

Cancellation reason is stored. All state transitions are written to `auditLogs`.

---

## 12. Billing & Credits

**Route:** `/settings/billing`  
**Backend:** Clerk (subscriptions) + Stripe (one-time credit top-ups)

### 12.1 Subscription Plans

Managed by Clerk's billing system. Displayed on the landing page's pricing section via `<CustomClerkPricing />`. Each plan defines:
- Monthly AI credit allowance (included in subscription).
- Maximum org member seats.

### 12.2 AI Credits

Credits are consumed each time the AI pipeline processes a message group. The deduction is proportional to token usage.

**Credit balance:** `orgBilling.creditsTotal - orgBilling.creditsUsed`

Credits reset each billing period. Unused credits do not roll over.

### 12.3 Credit Top-Up Packs (Stripe)

Available packs (all priced in SGD):

| Pack | Credits |
|------|---------|
| Starter | 1,000 |
| Growth | 5,000 |
| Pro | 15,000 |
| Enterprise | 50,000 |

Purchase flow:
1. User clicks "Buy Credits" → creates Stripe Checkout Session.
2. User completes payment on Stripe-hosted page.
3. Stripe webhook (`payment_intent.succeeded`) → `stripeEvents` idempotency check → `creditTransactions` record → increments `orgBilling.creditsTotal`.

### 12.4 Auto-Recharge

When enabled:
- `autoRechargeThreshold`: credits balance that triggers a recharge.
- `autoRechargePack`: which pack to automatically purchase.
- `autoRechargeInProgress` lock prevents concurrent purchases.
- Checked after every `usage` credit transaction.

### 12.5 Monthly Spend Limit

`monthlySpendLimitSGD` caps total Stripe charges per calendar month. Checked before every auto-recharge and manual purchase.

### 12.6 Transaction History

Append-only `creditTransactions` ledger. Types: `purchase` · `auto_recharge` · `usage` · `refund` · `admin_adjustment`.

Each transaction stores `amount`, `balanceAfter`, `description`, and optional metadata (pack ID, token count, price).

### 12.7 Payment Methods

Stripe payment methods listed and managed from the Billing page (add, remove, set default). Backed by `stripeCustomerId` on the org billing record.

---

## 13. Dashboard Pages Reference

| Route | Description |
|-------|-------------|
| `/dashboard` | Global dashboard home (org selector) |
| `/dashboard/new` | Create new organization |
| `/dashboard/payment-gated` | Shown when subscription is required |
| `/dashboard/[orgSlug]/overview` | Org overview: active project count, credit usage, recent activity |
| `/dashboard/[orgSlug]/analytics` | Usage analytics (AI calls, token consumption, stage progression rates) |
| `/dashboard/[orgSlug]/activity` | Immutable audit log: actor, event type, entity, timestamp |
| `/dashboard/[orgSlug]/groups` | Connected LINE groups list |
| `/dashboard/[orgSlug]/groups/[groupId]` | Chat feed + project cards (split panel) |
| `/dashboard/[orgSlug]/projects` | All projects: list and kanban views |
| `/dashboard/[orgSlug]/projects/[projectId]` | Full project detail |
| `/dashboard/[orgSlug]/templates` | Workflow template library |
| `/dashboard/[orgSlug]/templates/[templateId]/edit` | Template stage editor + RAG documents tab |
| `/dashboard/[orgSlug]/knowledge-sources` | Org-level RAG document library |
| `/dashboard/[orgSlug]/members` | Member management (Owner/Admin only) |
| `/dashboard/[orgSlug]/settings/general` | General org settings |
| `/dashboard/[orgSlug]/settings/organization` | Org profile + members (Owner/Admin only) |
| `/dashboard/[orgSlug]/settings/billing` | Credits, subscriptions, payment methods (Owner/Admin only) |
| `/dashboard/[orgSlug]/settings/line` | LINE channel credentials (Owner/Admin only) |

---

## 14. Data Model Summary

| Table | Purpose |
|-------|---------|
| `users` | Clerk-synced user records |
| `organizations` | Tenants; holds LINE credentials (encrypted) |
| `memberships` | User ↔ Org access with role (owner/admin/member) |
| `teams` | Role groups within an org (e.g. "Deye Team") |
| `roles` | Named roles within a team (e.g. "Business Analyst") |
| `groupChatRoleMappings` | LINE user → role assignment per group |
| `connectTokens` | Ephemeral tokens for group chat linking |
| `groupChats` | Connected LINE groups (globally unique lineGroupId) |
| `workflowTemplates` | Workflow definitions |
| `workflowStageTemplates` | Ordered stages with fields and reminder config |
| `projects` | Active deal instances (template + group) |
| `projectStageStates` | Per-stage runtime state and collected fields |
| `pendingMessageGroups` | 10-second message batching before AI fires |
| `messages` | All LINE messages (inbound + bot) |
| `messageExtractions` | AI extraction results per message |
| `reminders` | Scheduled/sent/cancelled reminder records |
| `auditLogs` | Immutable event log (actor + entity + payload) |
| `orgBilling` | Subscription state, credit balance, Stripe IDs |
| `creditTransactions` | Append-only credit ledger |
| `stripePayments` | Stripe purchase records |
| `stripeEvents` | Stripe webhook idempotency store |
| `knowledgeSources` | Org-level RAG document metadata |
| `templateKnowledgeSources` | Template ↔ knowledge source links |
| `templateDocuments` | Embedded RAG chunks (3072-dim, gemini-embedding-001) |
| `aiTraces` | Per-message AI pipeline trace with token counts |
| `userLineProfiles` | LINE user display names and profile pictures |

---

## 15. Convex Runtime Architecture

| Runtime | Files | Can call |
|---------|-------|---------|
| **V8** | All files without `"use node"` — queries, mutations, most actions | Other V8 functions directly |
| **Node.js** | `convex/aiChains.ts`, `convex/templateDocumentsNode.ts` | V8 code via `ctx.runQuery` / `ctx.runMutation` / `ctx.runAction` only |

Node.js files cannot export `query` or `mutation` — only `internalAction`.

The HTTP action in `convex/lineWebhook.ts` runs in V8 and schedules Node.js work via `ctx.scheduler.runAfter`.

---

## 16. LINE Bot Commands

Available in any connected group chat:

| Command | Description |
|---------|-------------|
| `/help` | Lists available commands |
| `/projects` | Lists active projects in this group |
| `/status` | Shows current stage and missing fields for the active project |
| `/new-project [name]` | Creates a new project in this group |

---

## 17. Security

- LINE webhook signatures verified with HMAC-SHA256 on every inbound request.
- LINE channel credentials stored encrypted in Convex using `CREDENTIALS_ENCRYPTION_KEY` (AES-256-equivalent application-layer encryption).
- All Convex public functions require Clerk JWT authentication.
- `requireMembership` enforces org-scoping — a user cannot access another org's data.
- `CLERK_WEBHOOK_SECRET` validates inbound Clerk webhooks.
- `GEMINI_API_KEY` is a Convex environment variable, not exposed to Next.js.
- Conversation data is never used for AI model training.

---

## 18. Environment Variables

| Variable | Where needed | Purpose |
|----------|-------------|---------|
| `NEXT_PUBLIC_CONVEX_URL` | Next.js | Convex deployment URL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Next.js | Clerk auth |
| `CLERK_SECRET_KEY` | Next.js | Clerk server auth |
| `CLERK_WEBHOOK_SECRET` | Convex dashboard | Validates Clerk webhooks |
| `GEMINI_API_KEY` | Convex dashboard | Gemini AI model access |
| `CREDENTIALS_ENCRYPTION_KEY` | Convex dashboard | LINE credential encryption |
| `STRIPE_SECRET_KEY` | Convex dashboard | Stripe payments |
| `STRIPE_WEBHOOK_SECRET` | Convex dashboard | Stripe webhook validation |

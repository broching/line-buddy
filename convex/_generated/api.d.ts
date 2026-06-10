/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as aiChains from "../aiChains.js";
import type * as aiTraces from "../aiTraces.js";
import type * as analytics from "../analytics.js";
import type * as auditLogs from "../auditLogs.js";
import type * as billing from "../billing.js";
import type * as clerkWebhook from "../clerkWebhook.js";
import type * as connectTokens from "../connectTokens.js";
import type * as fileStorage from "../fileStorage.js";
import type * as groupChatRoleMappings from "../groupChatRoleMappings.js";
import type * as groupChats from "../groupChats.js";
import type * as http from "../http.js";
import type * as knowledgeSources from "../knowledgeSources.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_lineApi from "../lib/lineApi.js";
import type * as lineWebhook from "../lineWebhook.js";
import type * as memberships from "../memberships.js";
import type * as messageExtractions from "../messageExtractions.js";
import type * as messages from "../messages.js";
import type * as organizations from "../organizations.js";
import type * as paymentAttemptTypes from "../paymentAttemptTypes.js";
import type * as paymentAttempts from "../paymentAttempts.js";
import type * as pendingMessageGroups from "../pendingMessageGroups.js";
import type * as projectStageStates from "../projectStageStates.js";
import type * as projects from "../projects.js";
import type * as reminders from "../reminders.js";
import type * as roles from "../roles.js";
import type * as stageActions from "../stageActions.js";
import type * as teams from "../teams.js";
import type * as templateDocuments from "../templateDocuments.js";
import type * as templateDocumentsNode from "../templateDocumentsNode.js";
import type * as userLineProfiles from "../userLineProfiles.js";
import type * as users from "../users.js";
import type * as workflow from "../workflow.js";
import type * as workflowStageTemplates from "../workflowStageTemplates.js";
import type * as workflowTemplates from "../workflowTemplates.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  aiChains: typeof aiChains;
  aiTraces: typeof aiTraces;
  analytics: typeof analytics;
  auditLogs: typeof auditLogs;
  billing: typeof billing;
  clerkWebhook: typeof clerkWebhook;
  connectTokens: typeof connectTokens;
  fileStorage: typeof fileStorage;
  groupChatRoleMappings: typeof groupChatRoleMappings;
  groupChats: typeof groupChats;
  http: typeof http;
  knowledgeSources: typeof knowledgeSources;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/lineApi": typeof lib_lineApi;
  lineWebhook: typeof lineWebhook;
  memberships: typeof memberships;
  messageExtractions: typeof messageExtractions;
  messages: typeof messages;
  organizations: typeof organizations;
  paymentAttemptTypes: typeof paymentAttemptTypes;
  paymentAttempts: typeof paymentAttempts;
  pendingMessageGroups: typeof pendingMessageGroups;
  projectStageStates: typeof projectStageStates;
  projects: typeof projects;
  reminders: typeof reminders;
  roles: typeof roles;
  stageActions: typeof stageActions;
  teams: typeof teams;
  templateDocuments: typeof templateDocuments;
  templateDocumentsNode: typeof templateDocumentsNode;
  userLineProfiles: typeof userLineProfiles;
  users: typeof users;
  workflow: typeof workflow;
  workflowStageTemplates: typeof workflowStageTemplates;
  workflowTemplates: typeof workflowTemplates;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

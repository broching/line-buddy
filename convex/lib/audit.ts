import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

type AuditLogParams = {
  organizationId: Id<"organizations">;
  actorId?: Id<"users">;
  actorType: "user" | "bot" | "system";
  eventType: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
};

// Appends an immutable audit log entry. Always fire-and-forget — never await
// this in a path where its failure should block the primary operation.
export async function writeAuditLog(ctx: MutationCtx, params: AuditLogParams) {
  await ctx.db.insert("auditLogs", {
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorType: params.actorType,
    eventType: params.eventType,
    entityType: params.entityType,
    entityId: params.entityId,
    payload: params.payload ?? {},
    timestamp: Date.now(),
  });
}

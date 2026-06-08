import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ─── Internal helper queries ──────────────────────────────────────────────────

export const getUserByExternalId = internalQuery({
  args: { externalId: v.string() },
  handler: async (ctx, { externalId }) => {
    return ctx.db
      .query("users")
      .withIndex("byExternalId", (q) => q.eq("externalId", externalId))
      .unique();
  },
});

// ─── Public queries ───────────────────────────────────────────────────────────

export const list = query({
  args: {
    templateId: v.id("workflowTemplates"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { templateId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    const all = await ctx.db
      .query("templateDocuments")
      .withIndex("byTemplateId", (q) => q.eq("templateId", templateId))
      .take(500);

    // Deduplicate by title — show one entry per document name
    const seen = new Map<string, (typeof all)[0]>();
    for (const doc of all) {
      if (!seen.has(doc.title)) seen.set(doc.title, doc);
    }

    return Array.from(seen.values()).map((doc) => ({
      _id: doc._id,
      title: doc.title,
      totalChunks: doc.totalChunks,
      storageId: doc.storageId,
      createdAt: doc.createdAt,
      createdBy: doc.createdBy,
    }));
  },
});

// ─── Internal queries (used by actions) ───────────────────────────────────────

export const getChunksByIds = internalQuery({
  args: { ids: v.array(v.id("templateDocuments")) },
  handler: async (ctx, { ids }) => {
    const docs = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return docs; // include nulls so the caller can index by position
  },
});

// ─── Public mutations ─────────────────────────────────────────────────────────

export const generateUploadUrl = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);
    return ctx.storage.generateUploadUrl();
  },
});

// Delete all chunks of a document (identified by title + storageId)
export const remove = mutation({
  args: {
    templateId: v.id("workflowTemplates"),
    organizationId: v.id("organizations"),
    title: v.string(),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { templateId, organizationId, title, storageId }) => {
    await requireMembership(ctx, organizationId);
    const all = await ctx.db
      .query("templateDocuments")
      .withIndex("byTemplateId", (q) => q.eq("templateId", templateId))
      .take(500);

    const toDelete = all.filter(
      (d) => d.title === title && (d.storageId ?? undefined) === (storageId ?? undefined)
    );
    for (const doc of toDelete) {
      await ctx.db.delete(doc._id);
    }
    if (storageId) {
      await ctx.storage.delete(storageId);
    }
  },
});

// ─── Internal mutations (called from Node action after embedding) ─────────────

export const storeChunk = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.optional(v.id("workflowTemplates")),
    knowledgeSourceId: v.optional(v.id("knowledgeSources")),
    title: v.string(),
    content: v.string(),
    embedding: v.array(v.number()),
    storageId: v.optional(v.id("_storage")),
    chunkIndex: v.number(),
    totalChunks: v.number(),
    createdAt: v.number(),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("templateDocuments", args);
  },
});

// ─── Internal action — vector search ─────────────────────────────────────────
// V8 runtime: ctx.vectorSearch is available in actions.
// Called from aiChains.ts (Node runtime) via ctx.runAction.

export const searchSimilar = internalAction({
  args: {
    organizationId: v.id("organizations"),
    // If provided, post-filter results to only these knowledge source IDs
    knowledgeSourceIds: v.optional(v.array(v.id("knowledgeSources"))),
    queryVector: v.array(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { organizationId, knowledgeSourceIds, queryVector, limit }) => {
    // Search all chunks in the org; post-filter by enabled knowledge sources
    const results = await ctx.vectorSearch("templateDocuments", "byEmbedding", {
      vector: queryVector,
      limit: (limit ?? 5) * 4, // fetch extra to account for post-filtering
      filter: (q) => q.eq("organizationId", organizationId),
    });

    if (results.length === 0) return [];

    const ids = results.map((r) => r._id as Id<"templateDocuments">);
    const docs: Array<{ _id: Id<"templateDocuments">; content: string; knowledgeSourceId?: Id<"knowledgeSources"> } | null> =
      await ctx.runQuery(internal.templateDocuments.getChunksByIds, { ids });

    const enabledSet = knowledgeSourceIds
      ? new Set(knowledgeSourceIds.map((id) => id as string))
      : null;

    const filtered = results
      .map((r, i) => ({ r, doc: docs[i] }))
      .filter(({ doc }) => {
        if (!doc) return false;
        if (!enabledSet) return true;
        return doc.knowledgeSourceId && enabledSet.has(doc.knowledgeSourceId as string);
      })
      .slice(0, limit ?? 5);

    return filtered.map(({ r, doc }) => ({
      _id: r._id,
      score: r._score,
      content: doc?.content ?? "",
    }));
  },
});

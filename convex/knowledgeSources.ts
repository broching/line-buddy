import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { Id } from "./_generated/dataModel";

// List all knowledge sources for an org
export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);
    return ctx.db
      .query("knowledgeSources")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .collect();
  },
});

// List knowledge sources for a template with enabled/disabled flag
export const listForTemplate = query({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("workflowTemplates"),
  },
  handler: async (ctx, { organizationId, templateId }) => {
    await requireMembership(ctx, organizationId);

    const [allSources, links] = await Promise.all([
      ctx.db
        .query("knowledgeSources")
        .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
        .collect(),
      ctx.db
        .query("templateKnowledgeSources")
        .withIndex("byTemplateId", (q) => q.eq("templateId", templateId))
        .collect(),
    ]);

    const linkMap = new Map(links.map((l) => [l.knowledgeSourceId as string, l]));

    return allSources.map((source) => {
      const link = linkMap.get(source._id as string);
      return {
        ...source,
        isEnabled: link?.isEnabled ?? false,
        linkId: link?._id ?? null,
      };
    });
  },
});

// Toggle a knowledge source on/off for a specific template
export const toggle = mutation({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("workflowTemplates"),
    knowledgeSourceId: v.id("knowledgeSources"),
    isEnabled: v.boolean(),
  },
  handler: async (ctx, { organizationId, templateId, knowledgeSourceId, isEnabled }) => {
    await requireMembership(ctx, organizationId);

    const existing = await ctx.db
      .query("templateKnowledgeSources")
      .withIndex("byTemplateId", (q) => q.eq("templateId", templateId))
      .filter((q) => q.eq(q.field("knowledgeSourceId"), knowledgeSourceId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { isEnabled });
    } else {
      await ctx.db.insert("templateKnowledgeSources", {
        organizationId,
        templateId,
        knowledgeSourceId,
        isEnabled,
      });
    }
  },
});

// Delete a knowledge source and all its chunks + template links
export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    knowledgeSourceId: v.id("knowledgeSources"),
  },
  handler: async (ctx, { organizationId, knowledgeSourceId }) => {
    await requireMembership(ctx, organizationId);

    const source = await ctx.db.get(knowledgeSourceId);
    if (!source || source.organizationId !== organizationId) throw new Error("Not found");

    // Delete all chunks
    const chunks = await ctx.db
      .query("templateDocuments")
      .withIndex("byKnowledgeSourceId", (q) => q.eq("knowledgeSourceId", knowledgeSourceId))
      .collect();
    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    // Delete all template links
    const links = await ctx.db
      .query("templateKnowledgeSources")
      .withIndex("byKnowledgeSourceId", (q) => q.eq("knowledgeSourceId", knowledgeSourceId))
      .collect();
    for (const link of links) {
      await ctx.db.delete(link._id);
    }

    // Delete storage file if present
    if (source.storageId) {
      try { await ctx.storage.delete(source.storageId); } catch {}
    }

    await ctx.db.delete(knowledgeSourceId);
  },
});

// Create a knowledge source record (called by the Node ingest action via internal)
export const createRecord = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    title: v.string(),
    description: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    totalChunks: v.number(),
    createdAt: v.number(),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("knowledgeSources", args);
  },
});

// Get enabled knowledge source IDs for a template (used by RAG pipeline — internal)
export const getEnabledForTemplate = internalQuery({
  args: { templateId: v.id("workflowTemplates") },
  handler: async (ctx, { templateId }) => {
    const links = await ctx.db
      .query("templateKnowledgeSources")
      .withIndex("byTemplateId", (q) => q.eq("templateId", templateId))
      .filter((q) => q.eq(q.field("isEnabled"), true))
      .collect();
    return links.map((l) => l.knowledgeSourceId);
  },
});

export const generateUploadUrl = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMembership(ctx, organizationId);
    return ctx.storage.generateUploadUrl();
  },
});

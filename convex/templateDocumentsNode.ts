"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Id } from "./_generated/dataModel";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

function getEmbeddings() {
  // text-embedding-004 returns empty vectors on v1beta (both endpoints).
  // embedding-001 is the stable v1beta model and also produces 768-dim vectors.
  return new GoogleGenerativeAIEmbeddings({
    model: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
    apiKey: process.env.GEMINI_API_KEY!,
  });
}

// Ingest a document from Convex storage: read → chunk → embed → store
// Org-level: creates a knowledgeSources record (no templateId required).
// Pass templateId only if you also want a legacy templateDocuments link.
export const ingestDocument = action({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.optional(v.id("workflowTemplates")), // optional — legacy or direct template upload
    title: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { organizationId, templateId, title, storageId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user: { _id: Id<"users"> } | null = await ctx.runQuery(
      internal.templateDocuments.getUserByExternalId,
      { externalId: identity.subject },
    );
    if (!user) throw new Error("User not found");
    const createdBy: Id<"users"> = user._id;

    // 1. Fetch file from Convex storage
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("File not found in storage");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);

    const contentType = res.headers.get("content-type") ?? "";
    let rawText: string;

    if (contentType.includes("pdf")) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const pdfParseModule = await import("pdf-parse");
      const pdfParse =
        typeof (pdfParseModule as any).default === "function"
          ? (pdfParseModule as any).default
          : pdfParseModule;
      const parsed = await pdfParse(buffer);
      rawText = parsed.text;
    } else {
      rawText = await res.text();
    }

    if (!rawText.trim()) throw new Error("Document is empty");

    // 2. Split into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
    });
    const chunks = await splitter.splitText(rawText);
    const totalChunks = chunks.length;

    // 3. Generate embeddings
    const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
    console.log(`[ingest] model="${embeddingModel}" chunks=${chunks.length}`);
    const embeddings = getEmbeddings();
    const vectors = await embeddings.embedDocuments(chunks);
    console.log(`[ingest] got ${vectors.length} vectors, first dim=${vectors[0]?.length ?? "undefined"}`);

    if (vectors.length === 0 || (vectors[0]?.length ?? 0) === 0) {
      throw new Error(`Embedding model "${embeddingModel}" returned empty vectors.`);
    }

    const now = Date.now();

    // 4. Create the org-level knowledge source record
    const knowledgeSourceId: Id<"knowledgeSources"> = await ctx.runMutation(internal.knowledgeSources.createRecord, {
      organizationId,
      title,
      storageId,
      totalChunks,
      createdAt: now,
      createdBy,
    });

    // 5. Store each chunk linked to the knowledge source
    for (let i = 0; i < chunks.length; i++) {
      await ctx.runMutation(internal.templateDocuments.storeChunk, {
        organizationId,
        templateId,
        knowledgeSourceId,
        title,
        content: chunks[i],
        embedding: vectors[i],
        storageId: i === 0 ? storageId : undefined,
        chunkIndex: i,
        totalChunks,
        createdAt: now,
        createdBy,
      });
    }

    return { chunks: totalChunks, knowledgeSourceId };
  },
});

// Generate embedding for a single query string (used by RAG chain in aiChains.ts)
// Uses embedDocuments (batchEmbedContents) — embedQuery (embedContent) returns 404 on v1beta
export const embedQuery = internalAction({
  args: { text: v.string() },
  handler: async (_ctx, { text }) => {
    const embeddings = getEmbeddings();
    return (await embeddings.embedDocuments([text]))[0];
  },
});

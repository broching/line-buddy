"use node";

import { internalAction, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { LLMResult } from "@langchain/core/outputs";
import { z } from "zod";
import { sendGroupMessage } from "./lib/messaging";
import { resolveSendCreds, type ChannelSendInfo } from "./lib/channelContext";

// ─── Model factory ────────────────────────────────────────────────────────────

// Attach tracker at model-constructor level so handleLLMEnd fires even inside
// withStructuredOutput wrappers that don't forward invoke-time callbacks.
function getLLM(tracker?: TokenTracker) {
  return new ChatGoogleGenerativeAI({
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite",
    apiKey: process.env.GEMINI_API_KEY!,
    temperature: 0,
    callbacks: tracker ? [tracker] : undefined,
  });
}

function getEmbeddings() {
  // text-embedding-004 returns empty vectors on v1beta (both endpoints).
  // embedding-001 is the stable v1beta model and also produces 768-dim vectors.
  return new GoogleGenerativeAIEmbeddings({
    model: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
    apiKey: process.env.GEMINI_API_KEY!,
  });
}

// ─── Token tracking callback ──────────────────────────────────────────────────

function extractTokensFromOutput(output: LLMResult): { input: number; output: number } {
  // AIMessage.usage_metadata (standard LangChain path)
  for (const gen of output.generations ?? []) {
    for (const g of gen ?? []) {
      const msg = (g as any).message;
      if (msg?.usage_metadata) {
        return {
          input: msg.usage_metadata.input_tokens ?? 0,
          output: msg.usage_metadata.output_tokens ?? 0,
        };
      }
      const gi = (g as any).generationInfo;
      if (gi?.usageMetadata) {
        return {
          input: gi.usageMetadata.promptTokenCount ?? 0,
          output: gi.usageMetadata.candidatesTokenCount ?? 0,
        };
      }
    }
  }
  // Fallback: llmOutput.usageMetadata
  const llmOut = output.llmOutput as any;
  if (llmOut?.usageMetadata) {
    return {
      input: llmOut.usageMetadata.promptTokenCount ?? llmOut.usageMetadata.inputTokenCount ?? 0,
      output: llmOut.usageMetadata.candidatesTokenCount ?? llmOut.usageMetadata.outputTokenCount ?? 0,
    };
  }
  // Last resort: dump raw structure so we can see what's there
  console.warn("[extractTokens] no token fields matched. llmOutput=", JSON.stringify(output.llmOutput ?? null),
    "firstGen=", JSON.stringify(output.generations?.[0]?.[0] ?? null));
  return { input: 0, output: 0 };
}

class TokenTracker extends BaseCallbackHandler {
  name = "TokenTracker";
  inputTokens = 0;
  outputTokens = 0;

  // handleLLMEnd fires for ChatGoogleGenerativeAI (handleChatModelEnd does not)
  async handleLLMEnd(output: LLMResult) {
    const { input, output: out } = extractTokensFromOutput(output);
    console.log(`[TokenTracker] handleLLMEnd: input=${input} output=${out}`);
    this.inputTokens += input;
    this.outputTokens += out;
  }
}

type StepTrace = {
  name: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  status: "success" | "skipped" | "error";
  details: string;
  prompt?: string;
};

async function formatPromptMessages(
  promptTemplate: ChatPromptTemplate,
  inputs: Record<string, unknown>
): Promise<string> {
  try {
    const messages = await promptTemplate.formatMessages(inputs);
    return messages
      .map((m) => `[${String(m._getType()).toUpperCase()}]\n${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
      .join("\n\n---\n\n");
  } catch {
    return "";
  }
}

async function runTracked<T>(
  name: string,
  fn: (tracker: TokenTracker) => Promise<T>,
  details: (result: T) => object
): Promise<{ result: T; trace: StepTrace }> {
  const tracker = new TokenTracker();
  const start = Date.now();
  try {
    const result = await fn(tracker);
    return {
      result,
      trace: {
        name,
        inputTokens: tracker.inputTokens,
        outputTokens: tracker.outputTokens,
        durationMs: Date.now() - start,
        status: "success",
        details: JSON.stringify(details(result)),
      },
    };
  } catch (err) {
    return {
      result: null as unknown as T,
      trace: {
        name,
        inputTokens: tracker.inputTokens,
        outputTokens: tracker.outputTokens,
        durationMs: Date.now() - start,
        status: "error",
        details: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      },
    };
  }
}

// ─── Context type (returned by ai.getContextForProcessing) ────────────────────

type StageState = {
  stateId: Id<"projectStageStates">;
  stageTemplateId: Id<"workflowStageTemplates">;
  stageOrder: number;
  status: string;
  collectedFields: Record<
    string,
    {
      value: unknown;
      confidence: number;
      extractedAt: number;
      subFields?: Record<string, { label: string; value: string; confidence: number; extractedAt: number }>;
    }
  >;
  template: {
    name: string;
    description?: string;
    requiredFields: Array<{
      key: string;
      label: string;
      type: string;
      isRequired: boolean;
      instructions?: string;
      examples?: string[];
    }>;
  } | null;
};

type ProjectWithStages = {
  _id: Id<"projects">;
  name: string;
  workflowTemplateId: Id<"workflowTemplates">;
  stages: StageState[];
};

type Context = {
  messageId: Id<"messages">;
  text: string;
  groupChatId: Id<"groupChats">;
  organizationId: Id<"organizations">;
  activeProjects: ProjectWithStages[];
  recentMessages: Array<{ text: string; tag: string; projectId: Id<"projects"> | null }>;
  channelContext: ChannelSendInfo | null;
};

// ─── Chain 1: Intent Classifier ───────────────────────────────────────────────

const intentSchema = z.object({
  intent: z.enum(["stage_filling", "product_query", "hybrid", "other"]),
  hasProductQuestion: z
    .boolean()
    .describe(
      "True ONLY if the message contains a genuine, explicit question that requires looking something up in a product/FAQ knowledge base (pricing, availability, specs, policies, hours, etc). Greetings, thanks, acknowledgements, and filler words are NEVER sufficient — those are always false."
    ),
  confidence: z.number(),
  reasoning: z.string(),
});

async function classifyIntent(text: string, context: Context, tracker: TokenTracker): Promise<{ result: z.infer<typeof intentSchema>; prompt: string }> {
  const fieldNames = context.activeProjects
    .flatMap((p) => p.stages.flatMap((s) => s.template?.requiredFields.map((f) => f.label) ?? []))
    .slice(0, 20)
    .join(", ");

  const projectNames = context.activeProjects.map((p) => p.name).join(", ");

  const recentHistory = context.recentMessages
    .slice(-5)
    .map((m) => `${m.tag}: "${m.text}"`)
    .join("\n");

  const promptTemplate = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You classify LINE group chat messages into one of four intents:

1. "stage_filling" — The message provides or updates information for a project order/workflow (e.g., addresses, quantities, names, dates, confirmations). This includes corrections like "change that to 3" or "my address is Oak St 12". A greeting, "hello", "thanks", or other filler word ALONGSIDE this data does NOT change the intent — it is still "stage_filling", not "hybrid".

2. "product_query" — The ENTIRE message is a genuine question about products, services, pricing, availability, or FAQs (e.g., "what flavors do you have?", "how much does delivery cost?", "what are your hours?"), with no separate order/workflow data to extract.

3. "hybrid" — The message contains BOTH (a) a genuine, explicit product/service QUESTION that needs a knowledge-base lookup, AND (b) separate order/workflow data to extract. Both parts must be real and distinguishable — do not use "hybrid" just because a greeting or filler word accompanies order data; that case is "stage_filling".

4. "other" — Greetings, off-topic messages, commands, acknowledgements, or unclear messages with no order/workflow data and no product question.

CRITICAL: Greetings ("hi", "hello"), acknowledgements ("ok", "thanks", "got it"), and filler words are NEVER a "question" component. Only classify as "hybrid" or "product_query" when there is an actual question requiring a lookup — set hasProductQuestion accordingly.

Active projects: ${projectNames}
Relevant field types: ${fieldNames}

Recent conversation:
${recentHistory || "(none)"}`,
    ],
    ["human", "Classify this message: \"{text}\""],
  ]);

  const model = getLLM(tracker);
  const chain = promptTemplate.pipe(model.withStructuredOutput(intentSchema));
  const [result, prompt] = await Promise.all([
    chain.invoke({ text }),
    formatPromptMessages(promptTemplate, { text }),
  ]);
  return { result, prompt };
}

// ─── Chain 2: Project Router ──────────────────────────────────────────────────

const routerSchema = z.object({
  projectId: z.string().describe("The project _id string, or the string 'none' if ambiguous or unclear"),
  confidence: z.number(),
  implicit: z.boolean(),
  reasoning: z.string(),
});

async function routeToProject(
  text: string,
  context: Context,
  tracker: TokenTracker
): Promise<{ result: z.infer<typeof routerSchema>; prompt: string }> {
  const projectList = context.activeProjects
    .map((p, i) => `${i + 1}. ID="${p._id}" Name="${p.name}"`)
    .join("\n");

  const historyLines = context.recentMessages
    .map((m) => {
      const projectNote = m.projectId
        ? ` [referring to: ${context.activeProjects.find((p) => p._id === m.projectId)?.name ?? m.projectId}]`
        : "";
      return `${m.tag}${projectNote}: "${m.text}"`;
    })
    .join("\n");

  const promptTemplate = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You determine which project a LINE group chat message refers to.

Active projects:
${projectList}

Conversation history (oldest first, includes which project each message referred to):
${historyLines || "(no prior messages)"}

Rules:
- If the message starts with "#ProjectName" or "#number", match to that project by name or number.
- A message like "for project #3" or "3" routes to the project numbered 3 in the list above.
- If no explicit tag, check if the message is a continuation of the most recently discussed project in history (e.g., "change that to 3 muffins", "actually make it 4", "sorry, update the address").
- If genuinely ambiguous between multiple projects, return projectId: "none" with low confidence.
- Return the project's exact _id string, or "none" if no clear match.`,
    ],
    ["human", "Which project does this message refer to? \"{text}\""],
  ]);

  const model = getLLM(tracker);
  const chain = promptTemplate.pipe(model.withStructuredOutput(routerSchema));
  const [result, prompt] = await Promise.all([
    chain.invoke({ text }),
    formatPromptMessages(promptTemplate, { text }),
  ]);
  return { result, prompt };
}

// ─── Chain 3: RAG Chain ───────────────────────────────────────────────────────

async function answerWithRAG(
  text: string,
  templateId: Id<"workflowTemplates">,
  organizationId: Id<"organizations">,
  ctx: ActionCtx,
  tracker: TokenTracker
): Promise<{ answer: string; chunksFound: number }> {
  const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
  console.log(`[RAG] embedding model="${embeddingModel}" query="${text.slice(0, 60)}"`);

  // 1. Embed the query
  const embeddingsClient = getEmbeddings();
  let allVectors: number[][];
  try {
    allVectors = await embeddingsClient.embedDocuments([text]);
  } catch (embedErr) {
    console.error("[RAG] embedDocuments threw:", embedErr);
    throw embedErr;
  }

  console.log(`[RAG] embedDocuments returned ${allVectors.length} vectors, first dim=${allVectors[0]?.length ?? "undefined"}`);

  const queryVector = allVectors[0];
  if (!queryVector || queryVector.length === 0) {
    console.error(`[RAG] embedding returned empty vector.`);
    throw new Error(`Embedding model "${embeddingModel}" returned an empty vector.`);
  }

  // 2. Get enabled knowledge sources for this template
  const enabledSourceIds = await ctx.runQuery(internal.knowledgeSources.getEnabledForTemplate, { templateId });
  console.log(`[RAG] templateId=${templateId} enabledSourceIds=${JSON.stringify(enabledSourceIds)}`);

  // 3. Vector search filtered by org (and post-filtered by enabled sources in the action)
  const chunks = await ctx.runAction(internal.templateDocuments.searchSimilar, {
    organizationId,
    knowledgeSourceIds: enabledSourceIds.length > 0 ? enabledSourceIds : undefined,
    queryVector,
    limit: 5,
  });

  if (!chunks || chunks.length === 0) {
    return {
      answer: "I don't have specific information about that in my knowledge base. Please contact us directly for more details.",
      chunksFound: 0,
    };
  }

  const context = chunks.map((c: { content: string }) => c.content).join("\n\n---\n\n");

  // 4. LLM answers using retrieved context
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are a helpful assistant for a business. Answer the customer's question using ONLY the provided knowledge base context below. If the context doesn't contain enough information to answer, say so politely and suggest they contact us directly.

Knowledge base:
${context}`,
    ],
    ["human", "{question}"],
  ]);

  const model = getLLM(tracker);
  const chain = prompt.pipe(model).pipe(new StringOutputParser());
  const answer = await chain.invoke({ question: text });
  return { answer, chunksFound: chunks.length };
}

// ─── Chain 4: Field Extractor (all stages) ────────────────────────────────────

type ExtractionResult = {
  stageStateId: Id<"projectStageStates">;
  stageTemplateId: Id<"workflowStageTemplates">;
  stageName: string;
  stageOrder: number;
  fields: Array<{
    key: string;
    components: Array<{ subKey: string; subLabel: string; value: string; confidence: number }>;
  }>;
  isUpdate: boolean;
};

const fieldExtractionSchema = z.object({
  stage_order: z.number(),
  fields: z.array(
    z.object({
      key: z.string(),
      components: z.array(
        z.object({
          subKey: z
            .string()
            .describe(
              'Stable snake_case identifier for this specific attribute. Use "value" for simple scalar fields (numbers, single names, dates) — the new value fully REPLACES the old one. For fields that can describe several distinct attributes (e.g. a "roof description" covering material, age, size), invent one short stable key per attribute (e.g. "material", "age_years", "square_feet") mentioned in the CURRENT message. Reuse the EXACT key shown under "existing sub-fields" when updating the same attribute again — only invent a new key for an attribute never seen before.'
            ),
          subLabel: z
            .string()
            .describe('Short human-readable label, e.g. "Material", "Age (years)". Use the field\'s own label when subKey is "value".'),
          value: z.string(),
          confidence: z.number(),
          evidence: z
            .string()
            .describe(
              "The exact verbatim substring copied from the CURRENT message that states this value. Must be an exact quote, not a paraphrase. If you cannot quote an exact phrase from the message, do not include this component."
            ),
        })
      ),
    })
  ),
  is_update: z.boolean(),
  reasoning: z.string(),
});

// Strips whitespace differences so an evidence quote can be matched against the
// source text without the model needing byte-for-byte formatting.
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

async function extractFields(
  text: string,
  project: ProjectWithStages,
  recentMessages: Context["recentMessages"],
  tracker: TokenTracker
): Promise<{ result: ExtractionResult | null; prompt: string }> {
  const historyLines = recentMessages
    .slice(-10)
    .map((m) => `${m.tag}: "${m.text}"`)
    .join("\n");

  const stagesDescription = project.stages
    .filter((s) => s.template)
    .map((s) => {
      const fields = s.template!.requiredFields
        .map((f) => {
          const collected = s.collectedFields[f.key];
          let currentVal: string;
          if (!collected) {
            currentVal = "not yet collected";
          } else if (collected.subFields && Object.keys(collected.subFields).length > 0) {
            const subParts = Object.entries(collected.subFields)
              .map(([key, sf]) => `${key}="${sf.value}"`)
              .join(", ");
            currentVal = `existing sub-fields=[${subParts}]`;
          } else {
            currentVal = `current: "${collected.value}"`;
          }
          const examplesStr = f.examples?.length
            ? ` examples=[${f.examples.map((e) => `"${e}"`).join(", ")}]`
            : "";
          return `    - key="${f.key}" label="${f.label}" type="${f.type}" required=${f.isRequired} ${currentVal}${f.instructions ? ` (${f.instructions})` : ""}${examplesStr}`;
        })
        .join("\n");
      return `Stage ${s.stageOrder} [${s.status}]: "${s.template!.name}"\n${fields}`;
    })
    .join("\n\n");

  const promptTemplate = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You extract structured field values from a LINE group chat message for a project workflow.

Project: "${project.name}"

All stages and their fields (including completed stages — users can update previously filled fields):
${stagesDescription}

Recent conversation history:
${historyLines || "(none)"}

Rules:
- Extract a value ONLY if it is explicitly and verbatim stated in the CURRENT message. Never infer, guess, calculate, round, autocomplete, or use outside knowledge.
- Each field has one or more "components". Most fields are simple scalars (numbers, single names, dates) — return exactly ONE component with subKey="value"; its value fully replaces whatever was there before.
- Some fields describe several distinct attributes (e.g. a "roof description" covering material, age, and size). For these, return ONE COMPONENT PER ATTRIBUTE actually mentioned in the CURRENT message — never invent a component for an attribute the message doesn't mention, and never re-emit a component the message doesn't restate just because it's in "existing sub-fields". A component you return always replaces any existing value under the same subKey; attributes you don't mention are left untouched automatically.
- For every component, "evidence" MUST be an exact verbatim quote copied from the current message that states that component's value — not from history, not paraphrased. If no exact phrase in the message supports it, omit the component entirely.
- Confidence must be >= 0.9 to include a component. Use 1.0 only when the evidence is unambiguous.
- Identify the correct stage by field names and context. Users may update completed stages.
- Set is_update=true if the message corrects or changes a previously stated value.
- Return stage_order=0 if no fields are relevant to any stage.
- The conversation history below is for context only (e.g. resolving "that" or "it") — never extract a value from history that is absent from the current message.`,
    ],
    ["human", "Extract fields from: \"{text}\""],
  ]);

  const model = getLLM(tracker);
  const chain = promptTemplate.pipe(model.withStructuredOutput(fieldExtractionSchema));
  const [llmResult, prompt] = await Promise.all([
    chain.invoke({ text }),
    formatPromptMessages(promptTemplate, { text }),
  ]);

  if (!llmResult.fields || llmResult.fields.length === 0) return { result: null, prompt };

  const targetStage = project.stages.find(
    (s) => s.stageOrder === llmResult.stage_order
  );
  if (!targetStage || !targetStage.template) return { result: null, prompt };

  const validKeys = new Set(
    targetStage.template.requiredFields.map((f) => f.key)
  );

  // Anti-hallucination gate: reject any component whose "evidence" quote doesn't actually
  // appear verbatim in the source message. This catches the model inventing values that
  // sound plausible but were never stated (the #1 hallucination pattern for extraction).
  const normalizedText = normalizeForMatch(text);
  const fieldLabelByKey = new Map(targetStage.template.requiredFields.map((f) => [f.key, f.label]));
  const validFields = llmResult.fields
    .filter((f) => validKeys.has(f.key))
    .map((f) => {
      const components = f.components.filter((c) => {
        if (c.confidence < 0.9) return false;
        const evidence = normalizeForMatch(c.evidence ?? "");
        if (!evidence || !normalizedText.includes(evidence)) {
          console.warn(
            `[extractFields] Rejected hallucinated component "${f.key}.${c.subKey}"="${c.value}" — evidence "${c.evidence}" not found verbatim in message "${text}"`
          );
          return false;
        }
        return true;
      });
      return { key: f.key, components };
    })
    .filter((f) => f.components.length > 0);

  if (validFields.length === 0) return { result: null, prompt };

  return {
    result: {
      stageStateId: targetStage.stateId,
      stageTemplateId: targetStage.stageTemplateId,
      stageName: targetStage.template.name,
      stageOrder: targetStage.stageOrder,
      fields: validFields.map((f) => ({
        key: f.key,
        components: f.components.map((c) => ({
          subKey: c.subKey || "value",
          subLabel: c.subLabel || fieldLabelByKey.get(f.key) || f.key,
          value: c.value,
          confidence: c.confidence,
        })),
      })),
      isUpdate: llmResult.is_update,
    },
    prompt,
  };
}

// ─── Outbound reply helper (channel-agnostic) ─────────────────────────────────

// Sends a bot reply to the group using whichever channel the group is on.
async function replyToGroup(
  channelContext: ChannelSendInfo | null,
  text: string,
  replyToken?: string,
  quoteToken?: string
): Promise<void> {
  if (!channelContext) return;
  const creds = await resolveSendCreds(channelContext);
  if (!creds) return;
  await sendGroupMessage(creds, channelContext.providerGroupId, { text, replyToken, quoteToken });
}

// ─── Batch entry point: fired by the 10s message-grouping scheduler ───────────

export const processMessageGroup = internalAction({
  args: { pendingGroupId: v.id("pendingMessageGroups") },
  handler: async (ctx, { pendingGroupId }) => {
    // Atomically consume the pending group record
    const group = await ctx.runMutation(internal.pendingMessageGroups.consume, { pendingGroupId });
    if (!group || group.messageIds.length === 0) return;

    const primaryMessageId = group.messageIds[group.messageIds.length - 1];

    let combinedText: string | undefined;
    if (group.messageIds.length > 1) {
      // Multiple messages: concatenate in arrival order
      const texts = await ctx.runQuery(internal.pendingMessageGroups.getMessageTexts, {
        messageIds: group.messageIds,
      });
      combinedText = texts.join("\n");
      // Mark secondary messages as complete (only the primary carries the trace)
      for (const msgId of group.messageIds.slice(0, -1)) {
        await ctx.runMutation(internal.ai.markMessageComplete, { messageId: msgId });
      }
    }

    await runAIPipeline(ctx, {
      messageId: primaryMessageId,
      replyToken: group.replyToken,
      quoteToken: group.quoteToken,
      combinedText,
    });
  },
});

// ─── Single-message entry point (kept for direct calls / backwards compat) ────

export const processGroupMessage = internalAction({
  args: {
    messageId: v.id("messages"),
    replyToken: v.optional(v.string()),
    quoteToken: v.optional(v.string()),
    combinedText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await runAIPipeline(ctx, args);
  },
});

// ─── Core AI pipeline ─────────────────────────────────────────────────────────

async function runAIPipeline(
  ctx: ActionCtx,
  { messageId, replyToken, quoteToken, combinedText }: {
    messageId: Id<"messages">;
    replyToken?: string;
    quoteToken?: string;
    combinedText?: string;
  }
) {
  const pipelineStart = Date.now();
  const traces: StepTrace[] = [];
  let outcome = "no_action";

  if (!process.env.GEMINI_API_KEY) {
    console.error("[aiChains] GEMINI_API_KEY not set");
    await ctx.runMutation(internal.ai.markMessageFailed, { messageId });
    return;
  }

  // 1. Load full context in one query round-trip
  const context = await ctx.runQuery(internal.ai.getContextForProcessing, { messageId }) as Context | null;
  if (!context) {
    await ctx.runMutation(internal.ai.markMessageComplete, { messageId });
    return;
  }

  if (context.activeProjects.length === 0) {
    await ctx.runMutation(internal.ai.markMessageComplete, { messageId });
    return;
  }

  // Gate: check credits are available before running AI (don't consume yet)
  const creditCheck = await ctx.runQuery(internal.billing.checkCanProcess, {
    organizationId: context.organizationId,
  });
  if (!creditCheck.canProcess) {
    console.log(`[aiChains] Skipping AI processing: ${creditCheck.reason}`);
    await ctx.runMutation(internal.ai.markMessageComplete, { messageId });
    return;
  }

  // When multiple messages were batched, use the combined text; otherwise use the original
  const inputText = combinedText ?? context.text;

  try {
    // 2. Classify intent
    const intentTracker = new TokenTracker();
    const intentStart = Date.now();
    const { result: intentResult, prompt: intentPrompt } = await classifyIntent(inputText, context, intentTracker);
    traces.push({
      name: "intent_classification",
      inputTokens: intentTracker.inputTokens,
      outputTokens: intentTracker.outputTokens,
      durationMs: Date.now() - intentStart,
      status: "success",
      details: JSON.stringify({
        intent: intentResult.intent,
        hasProductQuestion: intentResult.hasProductQuestion,
        confidence: intentResult.confidence,
        reasoning: intentResult.reasoning,
        ...(combinedText ? { batched: true, messageCount: combinedText.split("\n").length } : {}),
      }),
      prompt: intentPrompt,
    });
    console.log(`[aiChains] intent=${intentResult.intent} hasProductQuestion=${intentResult.hasProductQuestion} confidence=${intentResult.confidence} msg="${inputText.slice(0, 80)}"`);

    // Knowledge source (RAG) must only be queried when there's a genuine product/service
    // question — the "hybrid" label alone is not trustworthy enough (the model sometimes
    // conflates a greeting + stage data as "hybrid"), so this flag is the real gate.
    const shouldQueryKnowledgeSource =
      intentResult.intent === "product_query" ||
      (intentResult.intent === "hybrid" && intentResult.hasProductQuestion);

    // Shared RAG helper (used for product_query and hybrid)
    const runRAG = async () => {
      const templateId =
        context.activeProjects.find((p) =>
          p.stages.some((s) => s.status === "active")
        )?.workflowTemplateId ?? context.activeProjects[0]?.workflowTemplateId;

      if (!templateId) return;

      const ragTracker = new TokenTracker();
      const ragStart = Date.now();
      const { answer, chunksFound } = await answerWithRAG(inputText, templateId, context.organizationId, ctx, ragTracker);
      traces.push({
        name: "rag",
        inputTokens: ragTracker.inputTokens,
        outputTokens: ragTracker.outputTokens,
        durationMs: Date.now() - ragStart,
        status: "success",
        details: JSON.stringify({
          chunksFound,
          answerPreview: answer.slice(0, 200),
          templateId,
        }),
      });

      await replyToGroup(context.channelContext, answer, replyToken, quoteToken);
      await ctx.runMutation(internal.ai.storeBotMessage, {
        organizationId: context.organizationId,
        groupChatId: context.groupChatId,
        text: answer,
        timestamp: Date.now(),
      });
    };

    // Shared field extraction helper (used for stage_filling and hybrid)
    const runFieldExtraction = async (intentLabel: "stage_filling" | "hybrid") => {
      let project: ProjectWithStages | undefined;

      if (context.activeProjects.length === 1) {
        project = context.activeProjects[0];
        traces.push({
          name: "project_routing",
          inputTokens: 0,
          outputTokens: 0,
          durationMs: 0,
          status: "skipped",
          details: JSON.stringify({
            projectId: project._id,
            projectName: project.name,
            reason: "only_one_project",
            confidence: 1.0,
          }),
        });
      } else {
        const routingTracker = new TokenTracker();
        const routingStart = Date.now();
        const { result: routingResult, prompt: routingPrompt } = await routeToProject(inputText, context, routingTracker);
        const matchedProject = context.activeProjects.find((p) => p._id === routingResult.projectId);
        traces.push({
          name: "project_routing",
          inputTokens: routingTracker.inputTokens,
          outputTokens: routingTracker.outputTokens,
          durationMs: Date.now() - routingStart,
          status: "success",
          details: JSON.stringify({
            projectId: routingResult.projectId,
            projectName: matchedProject?.name ?? "unknown",
            confidence: routingResult.confidence,
            implicit: routingResult.implicit,
            reasoning: routingResult.reasoning,
          }),
          prompt: routingPrompt,
        });
        console.log(`[aiChains] routing confidence=${routingResult.confidence} projectId=${routingResult.projectId}`);

        if (!routingResult.projectId || routingResult.projectId === "none" || routingResult.confidence < 0.6) {
          // Only send clarification if this is a pure stage_filling intent
          if (intentLabel === "stage_filling") {
            const projectList = context.activeProjects
              .map((p, i) => `${i + 1}. ${p.name}`)
              .join("\n");
            const clarification = `Which project is this for?\n\nActive projects:\n${projectList}\n\nReply with the project number or use #ProjectName at the start of your message.`;

            await replyToGroup(context.channelContext, clarification, replyToken, quoteToken);
            await ctx.runMutation(internal.ai.storeBotMessage, {
              organizationId: context.organizationId,
              groupChatId: context.groupChatId,
              text: clarification,
              timestamp: Date.now(),
            });
            return "clarification_sent";
          }
          return "no_action";
        }

        project = context.activeProjects.find((p) => p._id === routingResult.projectId);
      }

      if (!project) return "no_action";

      await ctx.runMutation(internal.messages.assignToProject, {
        messageId,
        projectId: project._id,
        routingMethod: "ai",
      });

      const extractionTracker = new TokenTracker();
      const extractionStart = Date.now();
      const { result: extraction, prompt: extractionPrompt } = await extractFields(inputText, project, context.recentMessages, extractionTracker);

      traces.push({
        name: "field_extraction",
        inputTokens: extractionTracker.inputTokens,
        outputTokens: extractionTracker.outputTokens,
        durationMs: Date.now() - extractionStart,
        status: "success",
        details: JSON.stringify(
          extraction
            ? {
                stageName: extraction.stageName,
                stageOrder: extraction.stageOrder,
                fields: extraction.fields,
                isUpdate: extraction.isUpdate,
              }
            : { result: "no_fields_extracted" }
        ),
        prompt: extractionPrompt,
      });

      if (!extraction || extraction.fields.length === 0) return "no_action";

      const targetStage = project.stages.find((s) => s.stateId === extraction.stageStateId);
      const isCompleted = targetStage?.status === "completed";

      if (isCompleted || extraction.isUpdate) {
        for (const field of extraction.fields) {
          await ctx.runMutation(internal.projectStageStates.updateFieldFromAI, {
            stageStateId: extraction.stageStateId,
            fieldKey: field.key,
            components: field.components,
            isUpdate: extraction.isUpdate,
            sourceMessageId: messageId,
          });
        }
      } else {
        await ctx.runMutation(internal.ai.commitExtractionForStage, {
          messageId,
          organizationId: context.organizationId,
          projectId: project._id,
          stageStateId: extraction.stageStateId,
          stageId: extraction.stageTemplateId,
          fields: extraction.fields.map((f) => ({
            fieldKey: f.key,
            components: f.components,
          })),
          isUpdate: extraction.isUpdate,
          intent: intentLabel,
        });
        await ctx.runMutation(api.workflow.evaluateAndAdvance, { projectId: project._id });
      }
      return "stage_filled";
    };

    // ── Route based on intent ──────────────────────────────────────────────────
    if (intentResult.intent === "product_query") {
      await runRAG();
      outcome = "rag_answered";
      await ctx.runMutation(internal.ai.markMessageComplete, { messageId, intent: "product_query" });
    }

    else if (intentResult.intent === "hybrid") {
      // Only answer the question if the model flagged a genuine product question —
      // otherwise this is effectively just stage_filling (e.g. "hello voltage is 700v").
      if (shouldQueryKnowledgeSource) {
        await runRAG();
      }
      const extractOutcome = await runFieldExtraction("hybrid");
      outcome = extractOutcome === "stage_filled"
        ? (shouldQueryKnowledgeSource ? "stage_filled_and_rag" : "stage_filled")
        : (shouldQueryKnowledgeSource ? "rag_answered" : "no_action");
      await ctx.runMutation(internal.ai.markMessageComplete, {
        messageId,
        intent: "hybrid",
      });
    }

    else if (intentResult.intent === "stage_filling") {
      const extractOutcome = await runFieldExtraction("stage_filling");
      outcome = extractOutcome ?? "no_action";
      await ctx.runMutation(internal.ai.markMessageComplete, {
        messageId,
        intent: "stage_filling",
      });
    }

    // ── Other / unrelated ──────────────────────────────────────────────────
    else {
      await ctx.runMutation(internal.ai.markMessageComplete, { messageId, intent: "other" });
      outcome = "no_action";
    }
  } catch (err) {
    console.error("[aiChains] Error processing message:", err);
    traces.push({
      name: "error",
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
      status: "error",
      details: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
    });
    outcome = "error";
    await ctx.runMutation(internal.ai.markMessageFailed, { messageId });
  } finally {
    if (traces.length > 0) {
      const totalInput = traces.reduce((s, t) => s + t.inputTokens, 0);
      const totalOutput = traces.reduce((s, t) => s + t.outputTokens, 0);
      const totalTokens = totalInput + totalOutput;

      // Consume credits based on tokens: ceil(tokens/1000)
      // 500 tokens → 1, 1000 → 1, 1001 → 2, 4638 → 5
      const creditsToConsume = totalTokens > 0
        ? Math.ceil(totalTokens / 1000)
        : 0;

      if (creditsToConsume > 0) {
        try {
          await ctx.runMutation(internal.billing.consumeCredits, {
            organizationId: context!.organizationId,
            amount: creditsToConsume,
            description: `AI processing (${totalTokens} tokens)`,
            metadata: { totalTokens, inputTokens: totalInput, outputTokens: totalOutput, messageId, groupChatId: context!.groupChatId },
          });
          console.log(`[aiChains] Consumed ${creditsToConsume} credit(s) for ${totalTokens} tokens`);
        } catch (err) {
          console.error("[aiChains] Failed to consume credits:", err);
        }
      }

      try {
        await ctx.runMutation(internal.aiTraces.store, {
          messageId,
          organizationId: context!.organizationId,
          steps: traces,
          totalInputTokens: totalInput,
          totalOutputTokens: totalOutput,
          totalDurationMs: Date.now() - pipelineStart,
          outcome,
        });
      } catch (traceErr) {
        console.error("[aiChains] Failed to store trace:", traceErr);
      }
    }
  }
}

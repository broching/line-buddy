import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { sendGroupMessage } from "./lib/messaging";
import { buildChannelSendInfo, resolveSendCreds } from "./lib/channelContext";
import { phoneToJid } from "./lib/wasenderApi";

export const getFireContext = internalQuery({
  args: {
    stageTemplateId: v.id("workflowStageTemplates"),
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
  },
  handler: async (ctx, { stageTemplateId, projectId, organizationId, groupChatId }) => {
    const stageTemplate = await ctx.db.get(stageTemplateId);
    if (!stageTemplate || !stageTemplate.stageActions?.length) return null;

    const [group, project] = await Promise.all([
      ctx.db.get(groupChatId),
      ctx.db.get(projectId),
    ]);
    if (!group || !project) return null;
    const channelInfo = await buildChannelSendInfo(ctx, group);

    const allRoleIds = new Set(
      stageTemplate.stageActions.flatMap((a) => a.roleIds as string[])
    );

    const mappings = await ctx.db
      .query("groupChatRoleMappings")
      .withIndex("byGroupChatId", (q) => q.eq("groupChatId", groupChatId))
      .collect();

    const lineUserIdByRole: Record<string, string> = {};
    for (const m of mappings) {
      if (allRoleIds.has(m.roleId as string)) {
        lineUserIdByRole[m.roleId as string] = m.lineUserId;
      }
    }

    const uniqueLineUserIds = [...new Set(Object.values(lineUserIdByRole))];
    const profiles = await Promise.all(
      uniqueLineUserIds.map((uid) =>
        ctx.db
          .query("userLineProfiles")
          .withIndex("byOrganizationAndLineUserId", (q) =>
            q.eq("organizationId", organizationId).eq("lineUserId", uid)
          )
          .unique()
      )
    );
    const displayNameByUserId: Record<string, string> = {};
    for (const p of profiles) {
      if (p) displayNameByUserId[p.lineUserId] = p.displayName;
    }

    // Collect all field values from all stage states of this project
    const stageStates = await ctx.db
      .query("projectStageStates")
      .withIndex("byProjectId", (q) => q.eq("projectId", projectId))
      .collect();
    const collectedFields: Record<string, unknown> = {};
    for (const state of stageStates) {
      if (state.collectedFields) {
        Object.assign(collectedFields, state.collectedFields);
      }
    }

    return {
      stageActions: stageTemplate.stageActions as Array<{
        id: string;
        type: "group_message" | "pm_message";
        message: string;
        roleIds: Id<"roles">[];
      }>,
      channelInfo,
      lineUserIdByRole,
      displayNameByUserId,
      collectedFields,
    };
  },
});

function substituteVars(text: string, fields: Record<string, unknown>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const raw = fields[key.trim()];
    if (raw === undefined || raw === null) return `{{${key}}}`;
    // Stored as { value, extractedAt, confidence } by updateField/updateFieldFromAI
    if (typeof raw === "object" && "value" in (raw as object)) {
      return String((raw as { value: unknown }).value);
    }
    return String(raw);
  });
}

export const fire = internalAction({
  args: {
    stageTemplateId: v.id("workflowStageTemplates"),
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.stageActions.getFireContext, args);
    if (!context) return;
    const creds = context.channelInfo ? await resolveSendCreds(context.channelInfo) : null;
    if (!creds) return;

    for (const action of context.stageActions) {
      const resolvedMessage = substituteVars(action.message, context.collectedFields);
      const lineUserIds = (action.roleIds as string[])
        .map((roleId) => context.lineUserIdByRole[roleId])
        .filter(Boolean);

      if (action.type === "group_message") {
        const mentions = lineUserIds.map((uid) => ({
          userId: uid,
          displayName: context.displayNameByUserId[uid] ?? uid,
        }));
        await sendGroupMessage(creds, context.channelInfo!.providerGroupId, {
          text: resolvedMessage,
          mentions: mentions.length > 0 ? mentions : undefined,
        });
      } else {
        // pm_message — send individual DMs to each bound user
        for (const uid of lineUserIds) {
          const to = creds.channel === "whatsapp" ? phoneToJid(uid) : uid;
          await sendGroupMessage(creds, to, { text: resolvedMessage });
        }
      }
    }
  },
});

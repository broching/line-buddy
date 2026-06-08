import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Atomically fetch and delete a pending group — called by processMessageGroup action
export const consume = internalMutation({
  args: { pendingGroupId: v.id("pendingMessageGroups") },
  handler: async (ctx, { pendingGroupId }) => {
    const group = await ctx.db.get(pendingGroupId);
    if (!group) return null;
    await ctx.db.delete(pendingGroupId);
    return group;
  },
});

// Load the text of multiple messages in order
export const getMessageTexts = internalQuery({
  args: { messageIds: v.array(v.id("messages")) },
  handler: async (ctx, { messageIds }) => {
    const texts: string[] = [];
    for (const id of messageIds) {
      const msg = await ctx.db.get(id);
      if (msg && msg.text) texts.push(msg.text);
    }
    return texts;
  },
});

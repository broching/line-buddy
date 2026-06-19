import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { Id } from "./_generated/dataModel";

// ─── Project creation context ─────────────────────────────────────────────────
// Loaded reactively in the dialog as soon as group + template are selected.
// Returns the roles required by the template's stages, who's already mapped,
// and which LINE users have been seen in the group.

export const getProjectCreationContext = query({
  args: {
    templateId: v.id("workflowTemplates"),
    groupChatId: v.id("groupChats"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { templateId, groupChatId, organizationId }) => {
    await requireMembership(ctx, organizationId);

    const template = await ctx.db.get(templateId);
    if (!template || template.organizationId !== organizationId) return { roles: [], knownUsers: [] };

    let roles: { roleId: string; roleName: string; teamName: string | null; stageCount: number }[] = [];

    if (template.teamIds && template.teamIds.length > 0) {
      // Load all roles from the template's selected teams
      for (const teamId of template.teamIds) {
        const team = await ctx.db.get(teamId);
        const teamRoles = await ctx.db
          .query("roles")
          .withIndex("byTeamId", (q) => q.eq("teamId", teamId))
          .collect();
        for (const role of teamRoles) {
          if (role.organizationId !== organizationId) continue;
          roles.push({
            roleId: role._id as string,
            roleName: role.name,
            teamName: team?.name ?? null,
            stageCount: 0,
          });
        }
      }
    } else {
      // Fallback: roles referenced by stage-level responsibleRoleId
      const stages = await ctx.db
        .query("workflowStageTemplates")
        .withIndex("byTemplateId", (q) => q.eq("templateId", templateId))
        .collect();
      const roleIds = [
        ...new Set(stages.map((s) => s.responsibleRoleId).filter((id): id is Id<"roles"> => !!id)),
      ];
      for (const roleId of roleIds) {
        const role = await ctx.db.get(roleId);
        if (!role || role.organizationId !== organizationId) continue;
        const team = role.teamId ? await ctx.db.get(role.teamId) : null;
        roles.push({
          roleId: role._id as string,
          roleName: role.name,
          teamName: team?.name ?? null,
          stageCount: stages.filter((s) => s.responsibleRoleId === roleId).length,
        });
      }
    }

    if (roles.length === 0) return { roles: [], knownUsers: [] };

    // Existing role mappings for this group
    const existingMappings = await ctx.db
      .query("groupChatRoleMappings")
      .withIndex("byGroupChatId", (q) => q.eq("groupChatId", groupChatId))
      .collect();

    const assignedByRole: Record<string, string> = {};
    for (const m of existingMappings) {
      assignedByRole[m.roleId as string] = m.lineUserId;
    }

    const rolesWithAssignment = roles.map((r) => ({
      ...r,
      assignedLineUserId: assignedByRole[r.roleId] ?? null,
    }));

    // Known contacts for binding — scoped to the group's channel so a WhatsApp group
    // only shows WhatsApp members (and a LINE group only LINE members).
    const group = await ctx.db.get(groupChatId);
    const groupChannel = group?.channel ?? "line";
    const profiles = await ctx.db
      .query("userLineProfiles")
      .withIndex("byOrganizationId", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(200);

    const knownUsers = profiles
      .filter((p) => (p.channel ?? "line") === groupChannel)
      .slice(0, 100)
      .map((p) => ({
        lineUserId: p.lineUserId,
        displayName: p.displayName,
        pictureUrl: p.pictureUrl ?? null,
      }));

    return { roles: rolesWithAssignment, knownUsers };
  },
});

// ─── All mappings for a group ─────────────────────────────────────────────────

export const listByGroup = query({
  args: {
    groupChatId: v.id("groupChats"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, { groupChatId, organizationId }) => {
    await requireMembership(ctx, organizationId);
    return ctx.db
      .query("groupChatRoleMappings")
      .withIndex("byGroupChatId", (q) => q.eq("groupChatId", groupChatId))
      .collect();
  },
});

// ─── Create / update role assignments ────────────────────────────────────────
// Idempotent: one mapping per (groupChatId, roleId) — updates if changed.

export const upsertMany = mutation({
  args: {
    organizationId: v.id("organizations"),
    groupChatId: v.id("groupChats"),
    mappings: v.array(
      v.object({
        roleId: v.id("roles"),
        lineUserId: v.string(),
      })
    ),
  },
  handler: async (ctx, { organizationId, groupChatId, mappings }) => {
    const { user } = await requireMembership(ctx, organizationId);

    const group = await ctx.db.get(groupChatId);
    if (!group || group.organizationId !== organizationId) throw new Error("Group not found");

    const now = Date.now();

    // Load all current mappings for this group once
    const existing = await ctx.db
      .query("groupChatRoleMappings")
      .withIndex("byGroupChatId", (q) => q.eq("groupChatId", groupChatId))
      .collect();

    const byRole = new Map(existing.map((m) => [m.roleId as string, m]));

    for (const { roleId, lineUserId } of mappings) {
      const trimmed = lineUserId.trim();
      if (!trimmed) continue;

      const role = await ctx.db.get(roleId);
      if (!role || role.organizationId !== organizationId || !role.teamId) continue;

      const current = byRole.get(roleId as string);
      if (current) {
        if (current.lineUserId !== trimmed) {
          await ctx.db.patch(current._id, {
            lineUserId: trimmed,
            mappedBy: user._id,
            mappedAt: now,
          });
        }
      } else {
        await ctx.db.insert("groupChatRoleMappings", {
          organizationId,
          groupChatId,
          lineUserId: trimmed,
          roleId,
          teamId: role.teamId,
          mappedBy: user._id,
          mappedAt: now,
        });
      }
    }
  },
});

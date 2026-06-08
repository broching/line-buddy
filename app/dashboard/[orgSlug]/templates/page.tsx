"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import {
  IconPlus,
  IconTemplate,
  IconPencil,
  IconArchive,
  IconTrash,
  IconChevronDown,
  IconChevronRight,
  IconUsers,
  IconCopy,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "@/lib/date";

export default function TemplatesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });

  if (!org) return <TemplatesSkeleton />;

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div>
        <h2 className="text-xl font-semibold">Templates</h2>
        <p className="text-muted-foreground text-sm">
          Manage workflow templates and configure teams & roles for your group chats.
        </p>
      </div>

      <Tabs defaultValue="workflows">
        <TabsList>
          <TabsTrigger value="workflows">
            <IconTemplate className="size-3.5 mr-1.5" />
            Workflows
          </TabsTrigger>
          <TabsTrigger value="teams">
            <IconUsers className="size-3.5 mr-1.5" />
            Teams & Roles
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workflows" className="mt-4">
          <WorkflowTemplatesTab orgId={org._id} orgSlug={orgSlug} />
        </TabsContent>

        <TabsContent value="teams" className="mt-4">
          <TeamsRolesTab orgId={org._id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Workflow Templates Tab ───────────────────────────────────────────────────

function WorkflowTemplatesTab({ orgId, orgSlug }: { orgId: Id<"organizations">; orgSlug: string }) {
  const router = useRouter();
  const templates = useQuery(api.workflowTemplates.list, { organizationId: orgId });
  const teams = useQuery(api.teams.list, { organizationId: orgId });
  const createTemplate = useMutation(api.workflowTemplates.create);
  const archiveTemplate = useMutation(api.workflowTemplates.archive);
  const duplicateTemplate = useMutation(api.workflowTemplates.duplicate);
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [newName, setNewName] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  if (!templates || !teams) return <Skeleton className="h-48 rounded-xl" />;

  function openCreate() { setStep(1); setNewName(""); setSelectedTeamIds([]); setShowCreate(true); }
  function closeCreate() { setShowCreate(false); }

  function toggleTeam(id: string) {
    setSelectedTeamIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const templateId = await createTemplate({
        organizationId: orgId,
        name: newName.trim(),
        teamIds: selectedTeamIds.length > 0 ? selectedTeamIds as Id<"teams">[] : undefined,
      });
      closeCreate();
      router.push(`/dashboard/${orgSlug}/templates/${templateId}/edit`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create template");
      setCreating(false);
    }
  }

  async function handleDuplicate(templateId: Id<"workflowTemplates">, name: string) {
    try {
      const newId = await duplicateTemplate({ organizationId: orgId, templateId });
      toast.success(`"${name}" duplicated`);
      router.push(`/dashboard/${orgSlug}/templates/${newId}/edit`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to duplicate");
    }
  }

  async function handleArchive(templateId: Id<"workflowTemplates">, name: string) {
    const ok = await confirmDialog({
      title: `Archive "${name}"?`,
      description: "It won't be available for new projects, but existing projects are unaffected.",
      confirmLabel: "Archive",
      variant: "default",
    });
    if (!ok) return;
    try {
      await archiveTemplate({ organizationId: orgId, templateId });
      toast.success("Template archived");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to archive");
    }
  }

  return (
    <>
      {ConfirmDialogNode}
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <Button onClick={openCreate}>
            <IconPlus className="size-4" />
            New template
          </Button>
        </div>

        {templates.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <IconTemplate className="size-10 text-muted-foreground/40" />
              <div>
                <p className="font-medium">No templates yet</p>
                <p className="text-muted-foreground text-sm">Create your first workflow template.</p>
              </div>
              <Button variant="outline" onClick={openCreate}>
                <IconPlus className="size-4" />
                Create template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {templates.map((t) => (
              <TemplateRow
                key={t._id}
                template={t}
                teams={teams}
                orgSlug={orgSlug}
                onArchive={() => handleArchive(t._id, t.name)}
                onDuplicate={() => void handleDuplicate(t._id, t.name)}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) closeCreate(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              New workflow template
              {teams.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  Step {step} of 2
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {step === 1 ? (
            <form
              onSubmit={(e) => { e.preventDefault(); if (!newName.trim()) return; teams.length > 0 ? setStep(2) : void handleCreate(); }}
              className="flex flex-col gap-4 pt-2"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="template-name">Template name</Label>
                <Input
                  id="template-name"
                  placeholder="e.g. Solar Installation Workflow"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={creating}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeCreate}>Cancel</Button>
                <Button type="submit" disabled={!newName.trim()}>
                  {teams.length > 0 ? "Next →" : "Create & edit"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex flex-col gap-1.5">
                <Label>Which teams are involved in this workflow?</Label>
                <p className="text-xs text-muted-foreground">
                  Only roles from selected teams will appear in this template's reminder assignments and project role bindings.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {teams.map((team) => {
                  const selected = selectedTeamIds.includes(team._id);
                  return (
                    <button
                      key={team._id}
                      type="button"
                      onClick={() => toggleTeam(team._id)}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        selected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                      }`}
                    >
                      <div className={`size-4 rounded border flex items-center justify-center shrink-0 ${selected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                        {selected && <span className="text-primary-foreground text-[10px] leading-none">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{team.name}</p>
                        {team.description && (
                          <p className="text-xs text-muted-foreground truncate">{team.description}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>
                  ← Back
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => void handleCreate()} disabled={creating}>
                    Skip
                  </Button>
                  <Button type="button" onClick={() => void handleCreate()} disabled={creating}>
                    {creating ? "Creating…" : "Create & edit"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function TemplateRow({
  template,
  teams,
  orgSlug,
  onArchive,
  onDuplicate,
}: {
  template: Doc<"workflowTemplates">;
  teams: Doc<"teams">[];
  orgSlug: string;
  onArchive: () => void;
  onDuplicate: () => void;
}) {
  const router = useRouter();
  const stages = useQuery(api.workflowStageTemplates.listByTemplate, {
    templateId: template._id,
    organizationId: template.organizationId,
  });

  const involvedTeams = (template.teamIds ?? [])
    .map((id) => teams.find((t) => t._id === id))
    .filter(Boolean) as Doc<"teams">[];

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/30"
      onClick={() => router.push(`/dashboard/${orgSlug}/templates/${template._id}/edit`)}
    >
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <div className="flex items-center gap-3 min-w-0">
          <IconTemplate className="size-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="font-medium truncate">{template.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {involvedTeams.map((t) => (
                <Badge key={t._id} variant="outline" className="text-[10px] px-1.5 h-4">{t.name}</Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Badge variant="secondary" className="text-xs">
            {stages === undefined ? "…" : `${stages.length} stage${stages.length !== 1 ? "s" : ""}`}
          </Badge>
          <span className="text-xs text-muted-foreground">{formatDistanceToNow(template.updatedAt)}</span>
          <Button variant="ghost" size="icon" className="size-7"
            onClick={() => router.push(`/dashboard/${orgSlug}/templates/${template._id}/edit`)}>
            <IconPencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" title="Duplicate template" onClick={onDuplicate}>
            <IconCopy className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={onArchive}>
            <IconArchive className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}

// ─── Teams & Roles Tab ────────────────────────────────────────────────────────

function TeamsRolesTab({ orgId }: { orgId: Id<"organizations"> }) {
  const teams = useQuery(api.teams.list, { organizationId: orgId });
  const roles = useQuery(api.roles.listByOrg, { organizationId: orgId });
  const createTeam = useMutation(api.teams.create);
  const updateTeam = useMutation(api.teams.update);
  const createRole = useMutation(api.roles.create);
  const updateRole = useMutation(api.roles.update);
  const deleteRole = useMutation(api.roles.remove);
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Per-team new role form state
  const [addingRoleForTeam, setAddingRoleForTeam] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);

  if (!teams || !roles) return <Skeleton className="h-48 rounded-xl" />;

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    try {
      const teamId = await createTeam({
        organizationId: orgId,
        name: newTeamName.trim(),
        description: newTeamDesc.trim() || undefined,
      });
      setShowNewTeam(false);
      setNewTeamName("");
      setNewTeamDesc("");
      setExpandedTeamId(teamId);
      toast.success("Team created");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setCreatingTeam(false);
    }
  }

  async function handleCreateRole(e: React.FormEvent, teamId: Id<"teams">) {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setCreatingRole(true);
    try {
      await createRole({
        organizationId: orgId,
        teamId,
        name: newRoleName.trim(),
        description: newRoleDesc.trim() || undefined,
      });
      setAddingRoleForTeam(null);
      setNewRoleName("");
      setNewRoleDesc("");
      toast.success("Role created");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create role");
    } finally {
      setCreatingRole(false);
    }
  }

  async function handleDeleteRole(role: Doc<"roles">) {
    const ok = await confirmDialog({
      title: `Delete role "${role.name}"?`,
      description: "Stages that reference this role will lose their assignment.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteRole({ organizationId: orgId, roleId: role._id });
      toast.success("Role deleted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <>
      {ConfirmDialogNode}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Teams group roles together. Roles are assigned to workflow stages to route reminders.
          </p>
          <Button variant="outline" onClick={() => setShowNewTeam(true)}>
            <IconPlus className="size-4" />
            New team
          </Button>
        </div>

        {teams.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <IconUsers className="size-10 text-muted-foreground/40" />
              <div>
                <p className="font-medium">No teams yet</p>
                <p className="text-muted-foreground text-sm">
                  Create teams to organize roles like Owner, Engineer, etc.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {teams.map((team) => {
              const teamRoles = roles.filter((r) => r.teamId === team._id);
              const isExpanded = expandedTeamId === team._id;

              return (
                <Card key={team._id} className="overflow-hidden">
                  {/* Team header */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 select-none"
                    onClick={() => setExpandedTeamId(isExpanded ? null : team._id)}
                  >
                    {isExpanded
                      ? <IconChevronDown className="size-4 text-muted-foreground" />
                      : <IconChevronRight className="size-4 text-muted-foreground" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{team.name}</p>
                      {team.description && (
                        <p className="text-xs text-muted-foreground">{team.description}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {teamRoles.length} role{teamRoles.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>

                  {/* Roles list */}
                  {isExpanded && (
                    <>
                      <Separator />
                      <div className="px-4 py-3 flex flex-col gap-2">
                        {teamRoles.length === 0 && (
                          <p className="text-xs text-muted-foreground py-2">
                            No roles yet. Add the first role for this team.
                          </p>
                        )}
                        {teamRoles.map((role) => (
                          <RoleRow
                            key={role._id}
                            role={role}
                            orgId={orgId}
                            onUpdate={(patch) => updateRole({ organizationId: orgId, roleId: role._id, ...patch })}
                            onDelete={() => handleDeleteRole(role)}
                          />
                        ))}

                        {/* Add role form */}
                        {addingRoleForTeam === team._id ? (
                          <form
                            onSubmit={(e) => handleCreateRole(e, team._id)}
                            className="flex flex-col gap-2 pt-1 border rounded-lg p-3 bg-muted/30"
                          >
                            <div className="flex flex-col gap-1">
                              <Label className="text-xs">Role name</Label>
                              <Input
                                className="h-7 text-sm"
                                placeholder="e.g. Owner, Engineer"
                                value={newRoleName}
                                onChange={(e) => setNewRoleName(e.target.value)}
                                autoFocus
                                disabled={creatingRole}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label className="text-xs">Description</Label>
                              <Textarea
                                className="text-sm min-h-12 resize-none"
                                placeholder="What does this role do?"
                                value={newRoleDesc}
                                onChange={(e) => setNewRoleDesc(e.target.value)}
                                disabled={creatingRole}
                              />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => { setAddingRoleForTeam(null); setNewRoleName(""); setNewRoleDesc(""); }}
                              >
                                Cancel
                              </Button>
                              <Button type="submit" size="sm" disabled={creatingRole || !newRoleName.trim()}>
                                {creatingRole ? "Adding…" : "Add role"}
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-fit text-muted-foreground"
                            onClick={() => { setAddingRoleForTeam(team._id); setNewRoleName(""); setNewRoleDesc(""); }}
                          >
                            <IconPlus className="size-3.5" />
                            Add role
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* New team dialog */}
      <Dialog open={showNewTeam} onOpenChange={setShowNewTeam}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New team</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateTeam} className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-name">Team name</Label>
              <Input
                id="team-name"
                placeholder="e.g. Deye Team, Customer Team"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                disabled={creatingTeam}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="team-desc">Description <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                id="team-desc"
                placeholder="What is this team responsible for?"
                value={newTeamDesc}
                onChange={(e) => setNewTeamDesc(e.target.value)}
                disabled={creatingTeam}
                className="min-h-16 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowNewTeam(false)}>Cancel</Button>
              <Button type="submit" disabled={creatingTeam || !newTeamName.trim()}>
                {creatingTeam ? "Creating…" : "Create team"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Role Row ─────────────────────────────────────────────────────────────────

function RoleRow({
  role,
  orgId,
  onUpdate,
  onDelete,
}: {
  role: Doc<"roles">;
  orgId: Id<"organizations">;
  onUpdate: (patch: { name?: string; description?: string }) => Promise<unknown>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onUpdate({ name: name.trim(), description: description.trim() || undefined });
      setEditing(false);
      toast.success("Role updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 border rounded-lg p-3 bg-muted/20">
        <Input
          className="h-7 text-sm font-medium"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          disabled={saving}
        />
        <Textarea
          className="text-sm min-h-12 resize-none"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={saving}
        />
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-muted/20 group">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{role.name}</p>
        {role.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
        )}
        {!role.description && (
          <p className="text-xs text-muted-foreground/50 mt-0.5 italic">No description</p>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => { setName(role.name); setDescription(role.description ?? ""); setEditing(true); }}
        >
          <IconPencil className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-destructive"
          onClick={onDelete}
          disabled={role.isDefault}
          title={role.isDefault ? "Default roles cannot be deleted" : "Delete role"}
        >
          <IconTrash className="size-3" />
        </Button>
      </div>
      {role.isDefault && (
        <Badge variant="outline" className="text-xs shrink-0">default</Badge>
      )}
    </div>
  );
}

function TemplatesSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-64" />
      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
    </div>
  );
}

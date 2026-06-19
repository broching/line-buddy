"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconFolderOpen,
  IconPlus,
  IconMessage2,
  IconChevronRight,
  IconChevronLeft,
  IconSearch,
  IconX,
  IconLayoutList,
  IconLayoutColumns,
  IconArrowRight,
  IconTemplate,
} from "@tabler/icons-react";
import { toast } from "sonner";
import Link from "next/link";
import { formatDistanceToNow } from "@/lib/date";
import { PaywallGate } from "@/components/billing/paywall-gate";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  active:    { label: "Active",    className: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-0" },
  completed: { label: "Done",      className: "bg-green-500/15 text-green-700 dark:text-green-300 border-0" },
  paused:    { label: "Paused",    className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-0" },
  archived:  { label: "Archived",  className: "bg-muted text-muted-foreground border-0" },
};

const PAGE_SIZE = 15;

type ProjectWithMeta = Doc<"projects"> & {
  groupName: string | null;
  groupPictureUrl: string | null;
  lastMessageText: string | null;
  lastMessageAt: number | null;
};

export default function ProjectsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  return (
    <Suspense fallback={<ProjectsSkeleton />}>
      <ProjectsContent orgSlug={orgSlug} />
    </Suspense>
  );
}

function ProjectsContent({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const projects = useQuery(
    api.projects.listWithMeta,
    org ? { organizationId: org._id } : "skip"
  ) as ProjectWithMeta[] | undefined;
  const groups = useQuery(
    api.groupChats.list,
    org ? { organizationId: org._id } : "skip"
  );
  const templates = useQuery(
    api.workflowTemplates.list,
    org ? { organizationId: org._id } : "skip"
  );

  const [showCreate, setShowCreate] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filterGroupId, setFilterGroupId] = useState<string>(
    searchParams.get("groupId") ?? ""
  );
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [currentPage, setCurrentPage] = useState(1);

  if (!org || !projects || !groups || !templates) return <ProjectsSkeleton />;

  const activeGroups = groups.filter((g) => g.isActive);

  const filtered = projects.filter((p) => {
    if (searchText && !p.name.toLowerCase().includes(searchText.toLowerCase())) return false;
    if (filterGroupId && p.groupChatId !== filterGroupId) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function resetPage() { setCurrentPage(1); }

  const hasFilters = !!searchText || !!filterGroupId || !!filterStatus;

  const activeCount = projects.filter((p) => p.status === "active").length;

  return (
    <PaywallGate organizationId={org._id}>
    <div className="flex flex-col gap-5 px-4 lg:px-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Projects</h2>
          <p className="text-muted-foreground text-sm">
            {activeCount} active project{activeCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 gap-0.5">
            <button
              onClick={() => setView("list")}
              className={`p-1.5 rounded-md transition-colors ${view === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="List view"
            >
              <IconLayoutList className="size-4" />
            </button>
            <button
              onClick={() => setView("kanban")}
              className={`p-1.5 rounded-md transition-colors ${view === "kanban" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Kanban view"
            >
              <IconLayoutColumns className="size-4" />
            </button>
          </div>
          <Button
            onClick={() => setShowCreate(true)}
            disabled={activeGroups.length === 0 || templates.length === 0}
            title={
              activeGroups.length === 0
                ? "Connect a LINE group first"
                : templates.length === 0
                ? "Create a template first"
                : undefined
            }
          >
            <IconPlus className="size-4" />
            New project
          </Button>
        </div>
      </div>

      {/* Filters */}
      {projects.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search projects…"
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); resetPage(); }}
              className="pl-8 h-8 text-sm"
            />
            {searchText && (
              <button
                onClick={() => { setSearchText(""); resetPage(); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <IconX className="size-3.5" />
              </button>
            )}
          </div>

          <Select
            value={filterGroupId || "__all__"}
            onValueChange={(v) => { setFilterGroupId(v === "__all__" ? "" : v); resetPage(); }}
          >
            <SelectTrigger className="h-8 text-sm w-44">
              <SelectValue placeholder="All groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All groups</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g._id} value={g._id}>{g.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filterStatus || "__all__"}
            onValueChange={(v) => { setFilterStatus(v === "__all__" ? "" : v); resetPage(); }}
          >
            <SelectTrigger className="h-8 text-sm w-36">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => { setSearchText(""); setFilterGroupId(""); setFilterStatus(""); resetPage(); }}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Empty states */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center border border-dashed rounded-xl">
          <IconFolderOpen className="size-10 text-muted-foreground/30" />
          <div>
            <p className="font-medium">No projects yet</p>
            <p className="text-muted-foreground text-sm mt-0.5">
              {activeGroups.length === 0
                ? "Connect a LINE group first, then create projects here."
                : templates.length === 0
                ? "Create a workflow template first, then come back to start a project."
                : "Create a project or type /new-project in a connected group."}
            </p>
          </div>
          {activeGroups.length === 0 ? (
            <Button asChild>
              <Link href={`/dashboard/${orgSlug}/groups`}>
                <IconMessage2 className="size-4" />
                Connect a LINE group
                <IconArrowRight className="size-3.5" />
              </Link>
            </Button>
          ) : templates.length === 0 ? (
            <Button asChild>
              <Link href={`/dashboard/${orgSlug}/templates`}>
                <IconTemplate className="size-4" />
                Create a template
                <IconArrowRight className="size-3.5" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              <IconPlus className="size-4" /> Create project
            </Button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <IconSearch className="size-8 text-muted-foreground/30" />
          <p className="text-sm font-medium">No projects match your filters</p>
          <Button variant="ghost" size="sm" onClick={() => { setSearchText(""); setFilterGroupId(""); setFilterStatus(""); resetPage(); }}>
            Clear filters
          </Button>
        </div>
      ) : view === "kanban" ? (
        <KanbanView
          projects={filtered}
          orgSlug={orgSlug}
          onProjectClick={(id) => router.push(`/dashboard/${orgSlug}/projects/${id}`)}
        />
      ) : (
        <>
          {/* List view */}
          <div className="rounded-xl border overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-2 bg-muted/30 border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Project</span>
              <span className="w-20 text-center">Status</span>
              <span className="w-16 text-right">Stage</span>
              <span className="w-28 text-right">Last activity</span>
            </div>
            {paginated.map((p, i) => (
              <ProjectRow
                key={p._id}
                project={p}
                isLast={i === paginated.length - 1}
                onClick={() => router.push(`/dashboard/${orgSlug}/projects/${p._id}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="text-xs">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="size-7" disabled={safePage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
                  <IconChevronLeft className="size-3.5" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce<(number | "…")[]>((acc, p, i, arr) => {
                    if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…" ? (
                      <span key={`ell-${i}`} className="px-1">…</span>
                    ) : (
                      <Button key={p} variant={p === safePage ? "default" : "outline"} size="icon" className="size-7 text-xs" onClick={() => setCurrentPage(p as number)}>
                        {p}
                      </Button>
                    )
                  )}
                <Button variant="outline" size="icon" className="size-7" disabled={safePage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
                  <IconChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {org && activeGroups.length > 0 && templates.length > 0 && (
        <CreateProjectModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          orgId={org._id}
          orgSlug={orgSlug}
          groups={activeGroups}
          templates={templates}
        />
      )}
    </div>
    </PaywallGate>
  );
}

// ─── List view row ────────────────────────────────────────────────────────────

function ProjectRow({
  project,
  isLast,
  onClick,
}: {
  project: ProjectWithMeta;
  isLast: boolean;
  onClick: () => void;
}) {
  const status = STATUS_MAP[project.status] ?? { label: project.status, className: "" };

  return (
    <div
      className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${!isLast ? "border-b" : ""}`}
      onClick={onClick}
    >
      {/* Project name + group */}
      <div className="flex items-center gap-3 min-w-0">
        {project.groupPictureUrl ? (
          <img src={project.groupPictureUrl} alt="" className="size-7 rounded-full object-cover shrink-0 ring-1 ring-border" />
        ) : (
          <div className="size-7 rounded-full bg-muted flex items-center justify-center shrink-0 ring-1 ring-border">
            <IconMessage2 className="size-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate leading-tight">{project.name}</p>
          {project.lastMessageText ? (
            <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
              {project.lastMessageText.replace("[Dashboard] ", "").slice(0, 80)}
            </p>
          ) : project.groupName ? (
            <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">{project.groupName}</p>
          ) : null}
        </div>
      </div>

      {/* Status badge */}
      <div className="w-20 flex justify-center">
        <Badge className={`text-[11px] px-1.5 py-0 h-5 ${status.className}`}>
          {status.label}
        </Badge>
      </div>

      {/* Stage */}
      <div className="w-16 text-right">
        <span className="text-xs text-muted-foreground">Stage {project.currentStageOrder}</span>
      </div>

      {/* Last activity */}
      <div className="w-28 text-right">
        <span className="text-xs text-muted-foreground">
          {project.lastMessageAt
            ? formatDistanceToNow(project.lastMessageAt)
            : formatDistanceToNow(project.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ─── Kanban view ──────────────────────────────────────────────────────────────

const KANBAN_COLUMNS: { status: string; label: string; headerClass: string }[] = [
  { status: "active",    label: "Active",    headerClass: "text-blue-700 dark:text-blue-300 bg-blue-500/10" },
  { status: "paused",    label: "Paused",    headerClass: "text-yellow-700 dark:text-yellow-300 bg-yellow-500/10" },
  { status: "completed", label: "Completed", headerClass: "text-green-700 dark:text-green-300 bg-green-500/10" },
];

function KanbanView({
  projects,
  orgSlug,
  onProjectClick,
}: {
  projects: ProjectWithMeta[];
  orgSlug: string;
  onProjectClick: (id: Id<"projects">) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
      {KANBAN_COLUMNS.map((col) => {
        const colProjects = projects.filter((p) => p.status === col.status);
        return (
          <div key={col.status} className="flex flex-col gap-2">
            {/* Column header */}
            <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${col.headerClass}`}>
              <span className="text-xs font-semibold">{col.label}</span>
              <span className="text-xs font-medium opacity-70">{colProjects.length}</span>
            </div>

            {/* Cards */}
            {colProjects.length === 0 ? (
              <div className="rounded-xl border border-dashed flex items-center justify-center h-20 text-xs text-muted-foreground">
                No {col.label.toLowerCase()} projects
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {colProjects.map((p) => (
                  <KanbanCard key={p._id} project={p} onClick={() => onProjectClick(p._id)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({
  project,
  onClick,
}: {
  project: ProjectWithMeta;
  onClick: () => void;
}) {
  return (
    <div
      className="rounded-xl border bg-background p-3 cursor-pointer hover:shadow-sm hover:border-primary/30 transition-all"
      onClick={onClick}
    >
      {/* Group + project name */}
      <div className="flex items-start gap-2.5 mb-2">
        {project.groupPictureUrl ? (
          <img src={project.groupPictureUrl} alt="" className="size-8 rounded-full object-cover shrink-0 ring-1 ring-border mt-0.5" />
        ) : (
          <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0 ring-1 ring-border mt-0.5">
            <IconMessage2 className="size-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate leading-tight">{project.name}</p>
          {project.groupName && (
            <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">{project.groupName}</p>
          )}
        </div>
      </div>

      {/* Last message preview */}
      {project.lastMessageText && (
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed mb-2 pl-0.5">
          {project.lastMessageText.replace("[Dashboard] ", "").replace("[Image]", "📷").replace("[Sticker]", "🎭")}
        </p>
      )}

      {/* Footer: stage + time */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
        <span>Stage {project.currentStageOrder}</span>
        <span>
          {project.lastMessageAt
            ? formatDistanceToNow(project.lastMessageAt)
            : formatDistanceToNow(project.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ─── Create project modal (2 steps) ──────────────────────────────────────────

type RoleMapping = { roleId: string; lineUserId: string };

function CreateProjectModal({
  open,
  onClose,
  orgId,
  orgSlug,
  groups,
  templates,
}: {
  open: boolean;
  onClose: () => void;
  orgId: Id<"organizations">;
  orgSlug: string;
  groups: Doc<"groupChats">[];
  templates: Doc<"workflowTemplates">[];
}) {
  const router = useRouter();
  const createProject = useMutation(api.projects.create);
  const upsertRoleMappings = useMutation(api.groupChatRoleMappings.upsertMany);
  const refreshProfiles = useAction(api.userLineProfiles.refreshGroupProfiles);
  const fetchWaMembers = useAction(api.whatsappSessions.fetchGroupMembers);

  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState<string>(groups[0]?._id ?? "");
  const [templateId, setTemplateId] = useState<string>(templates[0]?._id ?? "");
  const [roleMappings, setRoleMappings] = useState<RoleMapping[]>([]);
  const [creating, setCreating] = useState(false);

  const lineGroups = groups.filter((g) => (g.channel ?? "line") === "line");
  const waGroups = groups.filter((g) => g.channel === "whatsapp");
  const selectedGroup = groups.find((g) => g._id === groupId);

  // Sync the group's members so they can be bound to roles — channel-specific source.
  useEffect(() => {
    if (!groupId || !orgId || !selectedGroup) return;
    if (selectedGroup.channel === "whatsapp") {
      fetchWaMembers({ groupChatId: groupId as Id<"groupChats">, organizationId: orgId }).catch(() => {});
    } else {
      refreshProfiles({ groupChatId: groupId as Id<"groupChats">, organizationId: orgId }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, orgId]);

  const context = useQuery(
    api.groupChatRoleMappings.getProjectCreationContext,
    groupId && templateId
      ? { templateId: templateId as Id<"workflowTemplates">, groupChatId: groupId as Id<"groupChats">, organizationId: orgId }
      : "skip"
  );

  function handleClose() {
    setStep(1); setName(""); setGroupId(groups[0]?._id ?? "");
    setTemplateId(templates[0]?._id ?? ""); setRoleMappings([]); setCreating(false);
    onClose();
  }

  function handleNext(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !groupId || !templateId) return;
    if (!context || context.roles.length === 0) { void doCreate([]); return; }
    setRoleMappings(context.roles.map((r) => ({ roleId: r.roleId, lineUserId: r.assignedLineUserId ?? "" })));
    setStep(2);
  }

  async function doCreate(overrideMappings?: RoleMapping[]) {
    const mappingsToSave = overrideMappings ?? roleMappings;
    setCreating(true);
    try {
      const valid = mappingsToSave
        .filter((m) => m.lineUserId.trim())
        .map((m) => ({ roleId: m.roleId as Id<"roles">, lineUserId: m.lineUserId.trim() }));
      if (valid.length > 0) {
        await upsertRoleMappings({ organizationId: orgId, groupChatId: groupId as Id<"groupChats">, mappings: valid });
      }
      const result = await createProject({
        organizationId: orgId,
        groupChatId: groupId as Id<"groupChats">,
        workflowTemplateId: templateId as Id<"workflowTemplates">,
        name: name.trim(),
      });
      toast.success(`Project "${result.projectName}" created`);
      handleClose();
      router.push(`/dashboard/${orgSlug}/projects/${result.projectId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
      setCreating(false);
    }
  }

  const hasRoles = (context?.roles.length ?? 0) > 0;
  const contextLoading = context === undefined && !!groupId && !!templateId;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            New project
            {hasRoles && <span className="text-xs font-normal text-muted-foreground">Step {step} of 2</span>}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <form onSubmit={handleNext} className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label>Project name</Label>
              <Input placeholder="e.g. Solar Install – Building A" value={name} onChange={(e) => setName(e.target.value)} disabled={creating} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Group chat</Label>
              <Select value={groupId} onValueChange={setGroupId} disabled={creating}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {lineGroups.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>LINE</SelectLabel>
                      {lineGroups.map((g) => (
                        <SelectItem key={g._id} value={g._id}>{g.displayName}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {waGroups.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>WhatsApp</SelectLabel>
                      {waGroups.map((g) => (
                        <SelectItem key={g._id} value={g._id}>{g.displayName}</SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Workflow template</Label>
              <Select value={templateId} onValueChange={setTemplateId} disabled={creating}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={creating || !name.trim() || contextLoading}>
                {contextLoading ? "Loading…" : hasRoles ? "Next →" : creating ? "Creating…" : "Create project"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-5 pt-2">
            <div>
              <p className="text-sm font-medium">Assign team members to roles</p>
              <p className="text-xs text-muted-foreground mt-0.5">Map {selectedGroup?.channel === "whatsapp" ? "WhatsApp" : "LINE"} group members to the roles used in this workflow. You can change this later.</p>
            </div>
            <div className="flex flex-col gap-3">
              {context?.roles.map((role, i) => (
                <RoleAssignmentRow
                  key={role.roleId}
                  role={role}
                  lineUserId={roleMappings[i]?.lineUserId ?? ""}
                  knownUsers={context.knownUsers}
                  channel={selectedGroup?.channel ?? "line"}
                  onChange={(v) => setRoleMappings((prev) => { const next = [...prev]; next[i] = { roleId: role.roleId, lineUserId: v }; return next; })}
                />
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)} disabled={creating}>← Back</Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => void doCreate([])} disabled={creating}>Skip</Button>
                <Button type="button" onClick={() => void doCreate()} disabled={creating}>{creating ? "Creating…" : "Create project"}</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Role assignment row ──────────────────────────────────────────────────────

function RoleAssignmentRow({
  role,
  lineUserId,
  knownUsers,
  channel = "line",
  onChange,
}: {
  role: { roleId: string; roleName: string; teamName: string | null; stageCount: number };
  lineUserId: string;
  knownUsers: Array<{ lineUserId: string; displayName: string; pictureUrl: string | null }>;
  channel?: "line" | "whatsapp";
  onChange: (v: string) => void;
}) {
  const [showManual, setShowManual] = useState(!!lineUserId && !knownUsers.some((u) => u.lineUserId === lineUserId));

  return (
    <div className="rounded-lg border p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium truncate">{role.roleName}</span>
          {role.teamName && <span className="text-xs text-muted-foreground shrink-0">· {role.teamName}</span>}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{role.stageCount} stage{role.stageCount !== 1 ? "s" : ""}</span>
      </div>
      {showManual ? (
        <div className="flex gap-2">
          <Input className="font-mono text-xs h-8" placeholder={channel === "whatsapp" ? "Phone number e.g. 6591234567" : "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"} value={lineUserId} onChange={(e) => onChange(e.target.value)} autoFocus />
          <Button type="button" variant="ghost" size="sm" className="shrink-0 h-8 text-xs px-2" onClick={() => { setShowManual(false); onChange(""); }}>← Pick</Button>
        </div>
      ) : knownUsers.length === 0 ? (
        <Select disabled value="__none__">
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="No participants found yet" /></SelectTrigger>
          <SelectContent><SelectItem value="__none__"><span className="text-muted-foreground">No participants found yet</span></SelectItem></SelectContent>
        </Select>
      ) : (
        <Select value={lineUserId || "__none__"} onValueChange={(v) => { if (v === "__manual__") { setShowManual(true); onChange(""); } else if (v === "__none__") onChange(""); else onChange(v); }}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select group member…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__"><span className="text-muted-foreground">Unassigned</span></SelectItem>
            {knownUsers.map((u) => <SelectItem key={u.lineUserId} value={u.lineUserId}>{u.displayName}</SelectItem>)}
            <SelectItem value="__manual__"><span className="text-primary text-xs">Enter LINE user ID…</span></SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ProjectsSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-4 lg:px-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="rounded-xl border overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
            <Skeleton className="size-7 rounded-full shrink-0" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
            </div>
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { use, useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import {
  IconGripVertical,
  IconPlus,
  IconTrash,
  IconChevronDown,
  IconChevronRight,
  IconArrowLeft,
  IconPencil,
  IconX,
  IconCopy,
  IconBraces,
  IconMoodSmile,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { REMINDER_OPTIONS } from "@/lib/date";
import { useConfirm } from "@/components/ui/confirm-dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";
import {
  IconDatabase,
  IconUpload,
  IconLoader2,
  IconFileText,
} from "@tabler/icons-react";

type FieldType = "text" | "number" | "date" | "select" | "file";
type CompletionRule = "all_required_fields" | "manual" | "custom";

type AvailableField = {
  key: string;
  label: string;
  stageName: string;
  stageOrder: number;
};

const COMMON_EMOJIS = [
  "👍", "✅", "🎉", "🔔", "📋", "📝", "💼", "🏆",
  "✨", "🚀", "⚠️", "❌", "📞", "📧", "💬", "🤝",
  "👋", "🙏", "🔑", "📅", "⏰", "🔄", "📊", "💡",
  "🔗", "📌", "📂", "🏷️", "🎯", "💰", "📦", "🔧",
];

type StageAction = {
  id: string;
  type: "group_message" | "pm_message";
  message: string;
  roleIds: Id<"roles">[];
};

type RequiredField = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  isRequired: boolean;
  instructions?: string;
  examples?: string[];
  responsibleRoleIds?: Id<"roles">[];
  reminderDelayMs?: number;
  reminderMessage?: string;
  maxReminderCount?: number;
};

export default function EditTemplatePage({
  params,
}: {
  params: Promise<{ orgSlug: string; templateId: string }>;
}) {
  const { orgSlug, templateId } = use(params);
  const router = useRouter();
  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const template = useQuery(
    api.workflowTemplates.get,
    org
      ? { templateId: templateId as Id<"workflowTemplates">, organizationId: org._id }
      : "skip"
  );
  const roles = useQuery(
    api.roles.listByOrg,
    org ? { organizationId: org._id } : "skip"
  );
  const teams = useQuery(
    api.teams.list,
    org ? { organizationId: org._id } : "skip"
  );

  const createStage = useMutation(api.workflowStageTemplates.create);
  const reorderStages = useMutation(api.workflowStageTemplates.reorder);
  const updateTemplate = useMutation(api.workflowTemplates.update);
  const duplicateTemplate = useMutation(api.workflowTemplates.duplicate);

  const [activeTab, setActiveTab] = useState<"stages" | "documents">("stages");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [expandedStageIds, setExpandedStageIds] = useState<Set<string>>(new Set());

  // Knowledge Sources tab — org-level sources with per-template toggle
  const knowledgeSources = useQuery(
    api.knowledgeSources.listForTemplate,
    org
      ? {
          organizationId: org._id,
          templateId: templateId as Id<"workflowTemplates">,
        }
      : "skip"
  );
  const toggleKnowledgeSource = useMutation(api.knowledgeSources.toggle);
  const generateUploadUrl = useMutation(api.knowledgeSources.generateUploadUrl);
  const ingestDocument = useAction(api.templateDocumentsNode.ingestDocument);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [showAddStageDrawer, setShowAddStageDrawer] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [kanbanScrollWidth, setKanbanScrollWidth] = useState(0);
  const hasInitializedExpanded = useRef(false);
  const kanbanRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStartX = useRef(0);
  const panScrollLeft = useRef(0);
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  // Expand all stages on first load
  const stages = template?.stages ?? [];
  useEffect(() => {
    if (!hasInitializedExpanded.current && stages.length > 0) {
      hasInitializedExpanded.current = true;
      setExpandedStageIds(new Set(stages.map((s) => s._id as string)));
    }
  }, [stages.length]);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Track kanban scroll width for the mirrored top scrollbar
  useEffect(() => {
    if (!kanbanRef.current || !isDesktop) return;
    const el = kanbanRef.current;
    const update = () => setKanbanScrollWidth(el.scrollWidth);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, [isDesktop]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (!org || !template || !roles || !teams) return <EditorSkeleton />;
  const typedStages = template.stages ?? [];

  // Only show roles from the template's selected teams (if any are selected)
  const displayRoles = template.teamIds && template.teamIds.length > 0
    ? roles.filter((r) => r.teamId && (template.teamIds as Id<"teams">[]).includes(r.teamId))
    : roles;

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = typedStages.findIndex((s) => s._id === active.id);
    const newIndex = typedStages.findIndex((s) => s._id === over.id);
    const reordered = arrayMove(typedStages, oldIndex, newIndex);
    try {
      await reorderStages({
        organizationId: org!._id,
        templateId: templateId as Id<"workflowTemplates">,
        orderedStageIds: reordered.map((s) => s._id),
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reorder");
    }
  }

  async function handleAddStage(e?: React.FormEvent) {
    e?.preventDefault();
    if (!newStageName.trim()) return;
    setAddingStage(true);
    try {
      const stageId = await createStage({
        organizationId: org!._id,
        templateId: templateId as Id<"workflowTemplates">,
        name: newStageName.trim(),
      });
      setNewStageName("");
      setShowAddStageDrawer(false);
      setExpandedStageIds((prev) => new Set([...prev, stageId]));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add stage");
    } finally {
      setAddingStage(false);
    }
  }

  async function handleSaveName() {
    if (!nameValue.trim() || nameValue === template!.name) { setEditingName(false); return; }
    try {
      await updateTemplate({ organizationId: org!._id, templateId: templateId as Id<"workflowTemplates">, name: nameValue.trim() });
      toast.success("Template name updated");
    } catch { toast.error("Failed to update name"); }
    setEditingName(false);
  }

  async function handleDuplicate() {
    try {
      const newId = await duplicateTemplate({ organizationId: org!._id, templateId: templateId as Id<"workflowTemplates"> });
      toast.success("Template duplicated");
      router.push(`/dashboard/${orgSlug}/templates/${newId}/edit`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to duplicate");
    }
  }

  async function handleFileUpload(file: File) {
    if (!org) return;
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({ organizationId: org._id });
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { storageId } = await uploadRes.json();
      const result = await ingestDocument({
        organizationId: org._id,
        title: file.name,
        storageId: storageId as Id<"_storage">,
      });
      // Auto-enable the newly uploaded source for this template
      if (result?.knowledgeSourceId) {
        await toggleKnowledgeSource({
          organizationId: org._id,
          templateId: templateId as Id<"workflowTemplates">,
          knowledgeSourceId: result.knowledgeSourceId as Id<"knowledgeSources">,
          isEnabled: true,
        });
      }
      toast.success(`"${file.name}" processed and enabled for this template`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function toggleTemplateTeam(teamId: Id<"teams">) {
    const current = (template!.teamIds ?? []) as Id<"teams">[];
    const next = current.includes(teamId) ? current.filter((id) => id !== teamId) : [...current, teamId];
    try {
      await updateTemplate({ organizationId: org!._id, templateId: templateId as Id<"workflowTemplates">, teamIds: next });
    } catch { toast.error("Failed to update teams"); }
  }

  function handlePanStart(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-stage-card]")) return;
    isPanning.current = true;
    panStartX.current = e.clientX;
    panScrollLeft.current = kanbanRef.current?.scrollLeft ?? 0;
    if (kanbanRef.current) kanbanRef.current.style.cursor = "grabbing";
  }

  function handlePanMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isPanning.current || !kanbanRef.current) return;
    kanbanRef.current.scrollLeft = panScrollLeft.current - (e.clientX - panStartX.current);
  }

  function handlePanEnd() {
    isPanning.current = false;
    if (kanbanRef.current) kanbanRef.current.style.cursor = "grab";
  }

  function handleKanbanScroll() {
    if (topScrollRef.current && kanbanRef.current) {
      topScrollRef.current.scrollLeft = kanbanRef.current.scrollLeft;
    }
  }

  function handleTopScroll() {
    if (kanbanRef.current && topScrollRef.current) {
      kanbanRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {ConfirmDialogNode}

      {/* Header: back + name (with pen icon) + stage count + Add stage */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link href={`/dashboard/${orgSlug}/templates`}>
          <Button variant="ghost" size="icon" className="size-8 shrink-0">
            <IconArrowLeft className="size-4" />
          </Button>
        </Link>

        {editingName ? (
          <Input
            className="text-xl font-semibold h-auto py-1 px-2 max-w-xs"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
            autoFocus
          />
        ) : (
          <div className="flex items-center gap-1 group">
            <h2 className="text-xl font-semibold">{template.name}</h2>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => { setNameValue(template.name); setEditingName(true); }}
              title="Rename template"
            >
              <IconPencil className="size-3.5" />
            </Button>
          </div>
        )}

        <Badge variant="outline" className="text-xs shrink-0">
          {typedStages.length} stage{typedStages.length !== 1 ? "s" : ""}
        </Badge>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => void handleDuplicate()}
            title="Duplicate template"
          >
            <IconCopy className="size-3.5" />
            Duplicate
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setNewStageName(""); setShowAddStageDrawer(true); }}
          >
            <IconPlus className="size-3.5" />
            Add stage
          </Button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b pb-0">
        <button
          type="button"
          onClick={() => setActiveTab("stages")}
          className={`px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors -mb-px border-b-2 ${
            activeTab === "stages"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Stages
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("documents")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors -mb-px border-b-2 ${
            activeTab === "documents"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <IconDatabase className="size-3.5" />
          Knowledge Sources
          {knowledgeSources && knowledgeSources.filter((s) => s.isEnabled).length > 0 && (
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
              {knowledgeSources.filter((s) => s.isEnabled).length}
            </span>
          )}
        </button>
      </div>

      {/* Knowledge Sources tab */}
      {activeTab === "documents" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3.5 text-sm text-muted-foreground">
            <IconDatabase className="size-4 mt-0.5 shrink-0" />
            <span>
              Toggle which org-level knowledge sources the AI searches for this template. Upload new sources here or manage all sources from the{" "}
              <strong>Knowledge Sources</strong> page.
            </span>
          </div>

          {/* Upload button */}
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileUpload(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <>
                  <IconLoader2 className="size-3.5 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <IconUpload className="size-3.5" />
                  Upload new source
                </>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">PDF, TXT, or Markdown · auto-enabled for this template</span>
          </div>

          {/* Knowledge source list with toggles */}
          {knowledgeSources === undefined ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : knowledgeSources.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No knowledge sources in this organization yet. Upload a document above to create one.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {knowledgeSources.map((source) => (
                <div
                  key={source._id}
                  className="flex items-center gap-3 rounded-lg border bg-background px-3.5 py-2.5"
                >
                  <IconFileText className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{source.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {source.totalChunks} chunk{source.totalChunks !== 1 ? "s" : ""} ·{" "}
                      {new Date(source.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Switch
                    checked={source.isEnabled}
                    onCheckedChange={(enabled) => {
                      if (!org) return;
                      void toggleKnowledgeSource({
                        organizationId: org._id,
                        templateId: templateId as Id<"workflowTemplates">,
                        knowledgeSourceId: source._id,
                        isEnabled: enabled,
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "stages" && <>
      {/* Involved teams toggle row */}
      {teams.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium shrink-0">Teams:</span>
          {teams.map((team) => {
            const selected = (template.teamIds ?? []).includes(team._id);
            return (
              <Badge
                key={team._id}
                variant={selected ? "default" : "outline"}
                className="cursor-pointer select-none text-xs transition-colors"
                onClick={() => void toggleTemplateTeam(team._id)}
              >
                {team.name}
              </Badge>
            );
          })}
          <span className="text-xs text-muted-foreground italic">
            Toggle teams to filter visible roles
          </span>
        </div>
      )}

      {typedStages.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-xl max-w-lg">
          No stages yet. Click "Add stage" to create your first stage.
        </div>
      )}

      {/* Top scrollbar — mirrors the kanban scroll position on desktop */}
      {isDesktop && typedStages.length > 0 && (
        <div
          ref={topScrollRef}
          className="overflow-x-auto overflow-y-hidden h-4 rounded"
          onScroll={handleTopScroll}
        >
          <div style={{ width: kanbanScrollWidth, height: 1 }} />
        </div>
      )}

      {/* Kanban board */}
      <div className={isDesktop ? "bg-muted/40 rounded-xl" : ""}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div
            ref={kanbanRef}
            className={
              isDesktop
                ? "flex flex-row gap-6 overflow-x-auto pb-6 px-6 pt-6 items-start cursor-grab select-none"
                : "flex flex-col gap-2"
            }
            style={isDesktop ? { scrollbarWidth: "none" } : undefined}
            onMouseDown={isDesktop ? handlePanStart : undefined}
            onMouseMove={isDesktop ? handlePanMove : undefined}
            onMouseUp={isDesktop ? handlePanEnd : undefined}
            onMouseLeave={isDesktop ? handlePanEnd : undefined}
            onScroll={isDesktop ? handleKanbanScroll : undefined}
          >
            <SortableContext
              items={typedStages.map((s) => s._id)}
              strategy={isDesktop ? horizontalListSortingStrategy : verticalListSortingStrategy}
            >
              {typedStages.map((stage, index) => {
                const availableFields: AvailableField[] = typedStages
                  .filter((s) => s.order <= stage.order)
                  .flatMap((s) =>
                    s.requiredFields.map((f) => ({
                      key: f.key,
                      label: f.label,
                      stageName: s.name,
                      stageOrder: s.order,
                    }))
                  );
                return (
                  <SortableStageCard
                    key={stage._id}
                    stage={stage}
                    index={index}
                    orgId={org._id}
                    roles={displayRoles}
                    teams={teams}
                    confirm={confirmDialog}
                    isExpanded={expandedStageIds.has(stage._id)}
                    isDesktop={isDesktop}
                    availableFields={availableFields}
                    onToggle={() =>
                      setExpandedStageIds((prev) => {
                        const next = new Set(prev);
                        next.has(stage._id) ? next.delete(stage._id) : next.add(stage._id);
                        return next;
                      })
                    }
                  />
                );
              })}
            </SortableContext>
          </div>
        </DndContext>
      </div>

      </>}

      {/* Add stage drawer */}
      <Drawer open={showAddStageDrawer} onOpenChange={setShowAddStageDrawer} direction="right">
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>New stage</DrawerTitle>
          </DrawerHeader>
          <form onSubmit={handleAddStage} className="flex flex-col gap-4 px-4 pb-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stage-name">Stage name</Label>
              <Input
                id="stage-name"
                placeholder="e.g. Gather Customer Details"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                disabled={addingStage}
                autoFocus
              />
            </div>
            <DrawerFooter className="px-0 pt-2">
              <Button type="submit" disabled={addingStage || !newStageName.trim()}>
                {addingStage ? "Adding…" : "Add stage"}
              </Button>
              <DrawerClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// ─── Sortable Stage Card ─────────────────────────────────────────────────────

function SortableStageCard({
  stage,
  index,
  orgId,
  roles,
  teams,
  confirm: confirmDialog,
  isExpanded,
  isDesktop,
  availableFields,
  onToggle,
}: {
  stage: Doc<"workflowStageTemplates">;
  index: number;
  orgId: Id<"organizations">;
  roles: Doc<"roles">[];
  teams: Doc<"teams">[];
  confirm: ReturnType<typeof useConfirm>["confirmDialog"];
  isExpanded: boolean;
  isDesktop: boolean;
  availableFields: AvailableField[];
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage._id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasFieldReminders = stage.requiredFields.some(
    (f) => (f.responsibleRoleIds?.length ?? 0) > 0 && (f.reminderDelayMs ?? 0) > 0
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-stage-card=""
      className={isDesktop ? "min-w-[380px] max-w-[380px] shrink-0 self-start cursor-default" : ""}
    >
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Stage header */}
        <div
          className="flex items-center gap-2 px-3 py-3 cursor-pointer hover:bg-muted/30 select-none"
          onClick={onToggle}
        >
          <button
            className="touch-none text-muted-foreground hover:text-foreground cursor-grab"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <IconGripVertical className="size-4" />
          </button>
          <Badge variant="outline" className="text-xs w-6 h-6 flex items-center justify-center p-0 shrink-0">
            {index + 1}
          </Badge>
          <span className="flex-1 font-medium text-sm truncate">{stage.name}</span>
          <div className="flex items-center gap-1 shrink-0">
            {stage.requiredFields.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {stage.requiredFields.length}f
              </span>
            )}
            {hasFieldReminders && (
              <Badge variant="secondary" className="text-[10px] px-1.5 h-4">⏰</Badge>
            )}
          </div>
          {isExpanded ? (
            <IconChevronDown className="size-4 text-muted-foreground shrink-0" />
          ) : (
            <IconChevronRight className="size-4 text-muted-foreground shrink-0" />
          )}
        </div>

        {/* Stage editor (expanded) */}
        {isExpanded && (
          <>
            <Separator />
            <StageEditor stage={stage} orgId={orgId} roles={roles} teams={teams} confirm={confirmDialog} availableFields={availableFields} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Stage Editor ────────────────────────────────────────────────────────────

function StageEditor({
  stage,
  orgId,
  roles,
  teams,
  confirm: confirmDialog,
  availableFields,
}: {
  stage: Doc<"workflowStageTemplates">;
  orgId: Id<"organizations">;
  roles: Doc<"roles">[];
  teams: Doc<"teams">[];
  confirm: ReturnType<typeof useConfirm>["confirmDialog"];
  availableFields: AvailableField[];
}) {
  const updateStage = useMutation(api.workflowStageTemplates.update);
  const removeStage = useMutation(api.workflowStageTemplates.remove);

  type StageFields = {
    name?: string;
    description?: string;
    requiredFields?: RequiredField[];
    responsibleRoleId?: Id<"roles">;
    reminderDelayMs?: number;
    completionRule?: CompletionRule;
    skipCondition?: string;
    stageActions?: StageAction[];
  };

  const save = useCallback(
    async (fields: StageFields) => {
      try {
        await updateStage({ organizationId: orgId, stageId: stage._id, ...fields });
      } catch {
        toast.error("Failed to save");
      }
    },
    [updateStage, orgId, stage._id]
  );

  async function handleRemove() {
    const ok = await confirmDialog({
      title: `Delete stage "${stage.name}"?`,
      description: "This cannot be undone. Running projects are not affected.",
      confirmLabel: "Delete stage",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await removeStage({ organizationId: orgId, stageId: stage._id });
      toast.success("Stage deleted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="px-4 py-4 flex flex-col gap-5">
      {/* Name */}
      <EditableField
        label="Stage name"
        value={stage.name}
        onSave={(v) => save({ name: v })}
      />

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Description</Label>
        <Textarea
          className="text-sm min-h-16 resize-none"
          defaultValue={stage.description ?? ""}
          placeholder="What happens in this stage…"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (stage.description ?? "")) save({ description: v || undefined });
          }}
        />
      </div>

      <Separator />

      {/* Required fields */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Required fields
          </Label>
        </div>
        <FieldsEditor
          fields={stage.requiredFields}
          roles={roles}
          teams={teams}
          onChange={(fields) => save({ requiredFields: fields })}
        />
      </div>

      <Separator />

      {/* Completion rule */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Completion rule
        </Label>
        <Select
          value={stage.completionRule}
          onValueChange={(v) => save({ completionRule: v as CompletionRule })}
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_required_fields">
              All required fields collected
            </SelectItem>
            <SelectItem value="manual">Manual advance only</SelectItem>
            <SelectItem value="custom" disabled>
              Custom rule (coming soon)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Actions on stage completion */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Actions on completion
          </Label>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => {
              const newAction: StageAction = {
                id: `action_${Date.now()}`,
                type: "group_message",
                message: "",
                roleIds: [],
              };
              save({ stageActions: [...((stage.stageActions as StageAction[] | undefined) ?? []), newAction] });
            }}
          >
            <IconPlus className="size-3" /> Add action
          </Button>
        </div>

        {((stage.stageActions as StageAction[] | undefined) ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No actions. Actions fire automatically when this stage is completed.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {((stage.stageActions as StageAction[] | undefined) ?? []).map((action, aIdx) => (
              <StageActionRow
                key={action.id}
                action={action}
                roles={roles}
                teams={teams}
                availableFields={availableFields}
                onChange={(updated) => {
                  const actions = [...((stage.stageActions as StageAction[] | undefined) ?? [])];
                  actions[aIdx] = updated;
                  save({ stageActions: actions });
                }}
                onRemove={() => {
                  const actions = ((stage.stageActions as StageAction[] | undefined) ?? []).filter(
                    (_, i) => i !== aIdx
                  );
                  save({ stageActions: actions });
                }}
              />
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div className="flex justify-end">
        <Button variant="destructive" size="sm" onClick={handleRemove}>
          <IconTrash className="size-3.5" />
          Delete stage
        </Button>
      </div>
    </div>
  );
}

// ─── Stage Action Row ─────────────────────────────────────────────────────────

function StageActionRow({
  action,
  roles,
  teams,
  availableFields,
  onChange,
  onRemove,
}: {
  action: StageAction;
  roles: Doc<"roles">[];
  teams: Doc<"teams">[];
  availableFields: AvailableField[];
  onChange: (updated: StageAction) => void;
  onRemove: () => void;
}) {
  const [message, setMessage] = useState(action.message);
  const [showVarPicker, setShowVarPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    const start = el ? (el.selectionStart ?? message.length) : message.length;
    const end = el ? (el.selectionEnd ?? message.length) : message.length;
    const newMsg = message.slice(0, start) + text + message.slice(end);
    setMessage(newMsg);
    onChange({ ...action, message: newMsg });
    setTimeout(() => {
      if (el) {
        el.selectionStart = el.selectionEnd = start + text.length;
        el.focus();
      }
    }, 0);
  }

  const assignedRoles = action.roleIds
    .map((id) => roles.find((r) => r._id === id))
    .filter(Boolean) as Doc<"roles">[];
  const assignedIds = new Set(action.roleIds as string[]);
  const availableRoles = roles.filter((r) => !assignedIds.has(r._id));
  const grouped = teams
    .map((team) => ({ team, roles: availableRoles.filter((r) => r.teamId === team._id) }))
    .filter((g) => g.roles.length > 0);

  return (
    <div className="rounded-lg border px-3 py-2.5 flex flex-col gap-2">
      {/* Type + delete */}
      <div className="flex items-center gap-2">
        <Select
          value={action.type}
          onValueChange={(v) => onChange({ ...action, type: v as StageAction["type"] })}
        >
          <SelectTrigger className="h-7 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="group_message">Group chat message</SelectItem>
            <SelectItem value="pm_message">PM (private message)</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground shrink-0"
          onClick={onRemove}
        >
          <IconTrash className="size-3" />
        </Button>
      </div>

      {/* Roles */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">
          {action.type === "group_message" ? "Mention roles" : "PM roles"}
        </Label>
        <div className="flex flex-wrap items-center gap-1">
          {assignedRoles.map((role) => (
            <Badge key={role._id} variant="secondary" className="text-xs flex items-center gap-1 pr-1">
              {role.name}
              <button
                type="button"
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                onClick={() =>
                  onChange({ ...action, roleIds: action.roleIds.filter((id) => id !== role._id) })
                }
              >
                <IconX className="size-2.5" />
              </button>
            </Badge>
          ))}
          {grouped.length > 0 && (
            <Select
              value=""
              onValueChange={(v) =>
                onChange({ ...action, roleIds: [...action.roleIds, v as Id<"roles">] })
              }
            >
              <SelectTrigger className="h-6 w-auto px-2 text-xs border-dashed gap-1 text-muted-foreground">
                <IconPlus className="size-3" />
                Add role
              </SelectTrigger>
              <SelectContent>
                {grouped.map(({ team, roles: tRoles }) => (
                  <div key={team._id}>
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {team.name}
                    </div>
                    {tRoles.map((role) => (
                      <SelectItem key={role._id} value={role._id} className="text-sm">
                        {role.name}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Message */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Message</Label>
          <div className="flex items-center gap-0.5">
            {availableFields.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  title="Insert variable"
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setShowVarPicker((v) => !v); setShowEmojiPicker(false); }}
                >
                  <IconBraces className="size-3.5" />
                </button>
                {showVarPicker && (
                  <div className="absolute right-0 bottom-7 z-30 bg-background border rounded-lg shadow-xl p-1.5 w-60 max-h-48 overflow-y-auto">
                    <p className="text-[10px] text-muted-foreground px-1.5 pb-1.5 uppercase tracking-wide font-semibold">
                      Available variables
                    </p>
                    {availableFields.map((f) => (
                      <button
                        key={`${f.stageOrder}-${f.key}`}
                        type="button"
                        className="w-full flex items-center gap-2 px-1.5 py-1.5 text-left hover:bg-muted rounded-md"
                        onClick={() => { insertAtCursor(`{{${f.key}}}`); setShowVarPicker(false); }}
                      >
                        <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded shrink-0">
                          {`{{${f.key}}}`}
                        </span>
                        <span className="flex-1 text-xs text-muted-foreground truncate">{f.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="relative">
              <button
                type="button"
                title="Insert emoji"
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setShowEmojiPicker((v) => !v); setShowVarPicker(false); }}
              >
                <IconMoodSmile className="size-3.5" />
              </button>
              {showEmojiPicker && (
                <div className="absolute right-0 bottom-7 z-30 bg-background border rounded-lg shadow-xl p-2 w-52">
                  <div className="grid grid-cols-8 gap-0.5">
                    {COMMON_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="text-base p-1 hover:bg-muted rounded leading-none"
                        onClick={() => { insertAtCursor(emoji); setShowEmojiPicker(false); }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <Textarea
          ref={textareaRef}
          className="text-xs min-h-16 resize-none"
          placeholder={
            action.type === "group_message"
              ? "e.g. Stage completed! 🎉 Proceed to next phase."
              : "e.g. Hi, the previous stage has been completed."
          }
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onBlur={() => {
            if (message !== action.message) onChange({ ...action, message });
          }}
        />
        {message.includes("{{") && (
          <p className="text-[10px] text-muted-foreground">
            Variables like <span className="font-mono">{"{{field}}"}</span> will be replaced with actual field values when sent.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Reminder Delay Picker ────────────────────────────────────────────────────

function ReminderDelayPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (ms: number) => void;
}) {
  const isCustom = value > 0 && !REMINDER_OPTIONS.some((o) => o.value === value);

  function parseCustom(ms: number) {
    if (ms % (24 * 60 * 60 * 1000) === 0) return { n: ms / (24 * 60 * 60 * 1000), unit: "days" as const };
    if (ms % (60 * 60 * 1000) === 0) return { n: ms / (60 * 60 * 1000), unit: "hours" as const };
    return { n: Math.round(ms / (60 * 1000)), unit: "minutes" as const };
  }

  const [showCustom, setShowCustom] = useState(isCustom);
  const [customNum, setCustomNum] = useState(() => isCustom ? String(parseCustom(value).n) : "1");
  const [customUnit, setCustomUnit] = useState<"minutes" | "hours" | "days">(
    () => isCustom ? parseCustom(value).unit : "hours"
  );

  function applyCustom(numStr: string, unit: string) {
    const n = parseFloat(numStr);
    if (!n || n <= 0) return;
    const mult: Record<string, number> = {
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
    };
    onChange(Math.round(n * (mult[unit] ?? 1)));
  }

  return (
    <div className="flex flex-col gap-1">
      <Select
        value={showCustom ? "__custom__" : String(value)}
        onValueChange={(v) => {
          if (v === "__custom__") {
            setShowCustom(true);
            setCustomNum("1");
            setCustomUnit("hours");
          } else {
            setShowCustom(false);
            onChange(Number(v));
          }
        }}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REMINDER_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
          ))}
          <SelectItem value="__custom__">Custom…</SelectItem>
        </SelectContent>
      </Select>
      {showCustom && (
        <div className="flex gap-1">
          <Input
            type="number"
            min={1}
            className="h-7 text-xs w-20"
            value={customNum}
            onChange={(e) => setCustomNum(e.target.value)}
            onBlur={() => applyCustom(customNum, customUnit)}
          />
          <Select
            value={customUnit}
            onValueChange={(u) => {
              setCustomUnit(u as "minutes" | "hours" | "days");
              applyCustom(customNum, u);
            }}
          >
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">min</SelectItem>
              <SelectItem value="hours">hours</SelectItem>
              <SelectItem value="days">days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// ─── Fields Editor ───────────────────────────────────────────────────────────
// Local draft state prevents Convex round-trips from dropping keystrokes.
// Label inputs update draft on every keystroke and save to Convex only on blur.
// Selects and switches save immediately (no intermediate typing state needed).

function FieldsEditor({
  fields,
  roles,
  teams,
  onChange,
}: {
  fields: RequiredField[];
  roles: Doc<"roles">[];
  teams: Doc<"teams">[];
  onChange: (fields: RequiredField[]) => void;
}) {
  const [draft, setDraft] = useState<RequiredField[]>(fields);
  const [expandedReminders, setExpandedReminders] = useState<Set<string>>(new Set());

  // Sync from Convex only when the set of field keys changes (add/remove from
  // outside), NOT when label content updates — that would reset in-progress typing.
  const prevKeySignature = useRef(fields.map((f) => f.key).join("\0"));
  const incomingKeySignature = fields.map((f) => f.key).join("\0");
  if (incomingKeySignature !== prevKeySignature.current) {
    prevKeySignature.current = incomingKeySignature;
    setDraft(fields);
  }

  function updateLabel(index: number, label: string) {
    setDraft((prev) => prev.map((f, i) => (i === index ? { ...f, label } : f)));
  }

  function commitLabel(index: number) {
    const updated = draft.map((f, i) => {
      if (i !== index) return f;
      const key = f.key.startsWith("field_")
        ? f.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || f.key
        : f.key;
      return { ...f, key };
    });
    setDraft(updated);
    onChange(updated);
  }

  function updateMeta(index: number, patch: Partial<RequiredField>) {
    const updated = draft.map((f, i) => (i === index ? { ...f, ...patch } : f));
    setDraft(updated);
    onChange(updated);
  }

  function addField() {
    const newField: RequiredField = {
      key: `field_${Date.now()}`,
      label: "",
      type: "text",
      isRequired: true,
    };
    const updated = [...draft, newField];
    setDraft(updated);
    onChange(updated);
  }

  function removeField(index: number) {
    const updated = draft.filter((_, i) => i !== index);
    setDraft(updated);
    onChange(updated);
  }

  function toggleReminder(key: string) {
    setExpandedReminders((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function addRoleToField(index: number, roleId: Id<"roles">) {
    const field = draft[index];
    const existing = field.responsibleRoleIds ?? [];
    if (existing.includes(roleId)) return;
    updateMeta(index, { responsibleRoleIds: [...existing, roleId] });
  }

  function removeRoleFromField(index: number, roleId: Id<"roles">) {
    const field = draft[index];
    updateMeta(index, {
      responsibleRoleIds: (field.responsibleRoleIds ?? []).filter((id) => id !== roleId),
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {draft.map((field, index) => {
        const reminderOpen = expandedReminders.has(field.key);
        const assignedRoles = (field.responsibleRoleIds ?? [])
          .map((id) => roles.find((r) => r._id === id))
          .filter(Boolean) as Doc<"roles">[];
        const hasReminder =
          (field.responsibleRoleIds?.length ?? 0) > 0 ||
          (field.reminderDelayMs ?? 0) > 0;

        return (
          <div key={field.key} className="rounded-lg border px-3 py-2.5 flex flex-col gap-2">
            {/* Row 1: label (full width) */}
            <Input
              className="h-8 text-sm"
              placeholder="Field label (e.g. Voltage)"
              value={field.label}
              onChange={(e) => updateLabel(index, e.target.value)}
              onBlur={() => commitLabel(index)}
            />

            {/* Row 2: type dropdown + required toggle + delete */}
            <div className="flex items-center gap-2">
              <Select
                value={field.type}
                onValueChange={(v) => updateMeta(index, { type: v as FieldType })}
              >
                <SelectTrigger className="h-7 text-xs w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="select">Select</SelectItem>
                  <SelectItem value="file">File</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5 ml-auto">
                <Label className="text-xs text-muted-foreground">Required</Label>
                <Switch
                  className="scale-75"
                  checked={field.isRequired}
                  onCheckedChange={(v) => updateMeta(index, { isRequired: v })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground"
                  onClick={() => removeField(index)}
                >
                  <IconTrash className="size-3" />
                </Button>
              </div>
            </div>

            {/* Row 3: AI instructions */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">AI extraction hint</Label>
              <Input
                className="h-7 text-xs placeholder:text-muted-foreground/50"
                placeholder="e.g. &quot;Extract the total invoice amount in THB, may appear after ฿ or 'Total'&quot;"
                value={field.instructions ?? ""}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev.map((f, i) =>
                      i === index ? { ...f, instructions: e.target.value } : f
                    )
                  )
                }
                onBlur={() => onChange(draft)}
              />
            </div>

            {/* Row 4: Field examples */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Field examples</Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:text-primary/80 flex items-center gap-0.5"
                  onClick={() =>
                    setDraft((prev) =>
                      prev.map((f, i) =>
                        i === index ? { ...f, examples: [...(f.examples ?? []), ""] } : f
                      )
                    )
                  }
                >
                  <IconPlus className="size-3" /> more
                </button>
              </div>
              {(field.examples ?? []).map((ex, exIdx) => (
                <div key={exIdx} className="flex items-center gap-1">
                  <Input
                    className="h-7 text-xs placeholder:text-muted-foreground/50 flex-1"
                    placeholder={`Example value ${exIdx + 1}`}
                    value={ex}
                    onChange={(e) => {
                      setDraft((prev) =>
                        prev.map((f, i) => {
                          if (i !== index) return f;
                          const examples = [...(f.examples ?? [])];
                          examples[exIdx] = e.target.value;
                          return { ...f, examples };
                        })
                      );
                    }}
                    onBlur={() => onChange(draft)}
                  />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => {
                      const updated = draft.map((f, i) => {
                        if (i !== index) return f;
                        const examples = (f.examples ?? []).filter((_, ei) => ei !== exIdx);
                        return { ...f, examples: examples.length ? examples : undefined };
                      });
                      setDraft(updated);
                      onChange(updated);
                    }}
                  >
                    <IconX className="size-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Reminder section toggle */}
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-fit mt-0.5"
              onClick={() => toggleReminder(field.key)}
            >
              {reminderOpen ? (
                <IconChevronDown className="size-3" />
              ) : (
                <IconChevronRight className="size-3" />
              )}
              Reminder
              {hasReminder && !reminderOpen && (
                <Badge variant="secondary" className="text-[10px] px-1 h-4 ml-1">
                  {assignedRoles.map((r) => r.name).join(", ") || "configured"}
                </Badge>
              )}
            </button>

            {/* Reminder config (expanded) */}
            {reminderOpen && (
              <div className="flex flex-col gap-2 pl-2 border-l-2 border-muted mt-1">
                {/* Responsible roles (multi-select with badges) */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Responsible roles</Label>
                  <div className="flex flex-wrap items-center gap-1">
                    {assignedRoles.map((role) => (
                      <Badge
                        key={role._id}
                        variant="secondary"
                        className="text-xs flex items-center gap-1 pr-1"
                      >
                        {role.name}
                        <button
                          type="button"
                          className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                          onClick={() => removeRoleFromField(index, role._id)}
                        >
                          <IconX className="size-2.5" />
                        </button>
                      </Badge>
                    ))}

                    {/* Only render the add-role dropdown if there are unassigned roles */}
                    {(() => {
                      const assignedIds = new Set((field.responsibleRoleIds ?? []) as string[]);
                      const availableRoles = roles.filter((r) => !assignedIds.has(r._id));
                      if (availableRoles.length === 0) return null;

                      // Group by team
                      const grouped = teams
                        .map((team) => ({
                          team,
                          roles: availableRoles.filter((r) => r.teamId === team._id),
                        }))
                        .filter((g) => g.roles.length > 0);

                      return (
                        <Select
                          value=""
                          onValueChange={(v) => addRoleToField(index, v as Id<"roles">)}
                        >
                          <SelectTrigger className="h-6 w-auto px-2 text-xs border-dashed gap-1 text-muted-foreground">
                            <IconPlus className="size-3" />
                            Add role
                          </SelectTrigger>
                          <SelectContent>
                            {grouped.map(({ team, roles: tRoles }) => (
                              <div key={team._id}>
                                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                  {team.name}
                                </div>
                                {tRoles.map((role) => (
                                  <SelectItem key={role._id} value={role._id} className="text-sm">
                                    {role.name}
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                  </div>
                </div>

                {/* Delay + max count */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Remind after</Label>
                    <ReminderDelayPicker
                      value={field.reminderDelayMs ?? 0}
                      onChange={(ms) => updateMeta(index, { reminderDelayMs: ms })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Max reminders</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      className="h-7 text-xs"
                      placeholder="3"
                      value={field.maxReminderCount ?? ""}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev.map((f, i) =>
                            i === index
                              ? { ...f, maxReminderCount: e.target.value ? Number(e.target.value) : undefined }
                              : f
                          )
                        )
                      }
                      onBlur={() => onChange(draft)}
                    />
                  </div>
                </div>

                {/* Reminder message */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Reminder message</Label>
                  <Textarea
                    className="text-xs min-h-12 resize-none"
                    placeholder="Message to send in the group chat (tagged roles will be mentioned automatically)"
                    value={field.reminderMessage ?? ""}
                    onChange={(e) =>
                      setDraft((prev) =>
                        prev.map((f, i) =>
                          i === index ? { ...f, reminderMessage: e.target.value } : f
                        )
                      )
                    }
                    onBlur={() => onChange(draft)}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
      <Button variant="outline" size="sm" className="w-fit" onClick={addField}>
        <IconPlus className="size-3.5" />
        Add field
      </Button>
    </div>
  );
}

// ─── Editable Field ──────────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    if (draft.trim() && draft !== value) onSave(draft.trim());
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          autoFocus
        />
      ) : (
        <p
          className="text-sm font-medium cursor-pointer hover:underline decoration-dashed underline-offset-2"
          onClick={() => { setDraft(value); setEditing(true); }}
        >
          {value}
        </p>
      )}
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <Skeleton className="h-8 w-64" />
      <div className="hidden md:flex flex-row gap-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl min-w-[300px]" />)}
      </div>
      <div className="flex md:hidden flex-col gap-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
      </div>
    </div>
  );
}

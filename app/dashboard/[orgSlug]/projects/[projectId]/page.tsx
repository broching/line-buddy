"use client";

import { Fragment, use, useState } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  IconCheck,
  IconClock,
  IconCircle,
  IconMinus,
  IconArrowRight,
  IconPencil,
  IconX,
  IconArrowLeft,
  IconBrain,
  IconMessage,
  IconAlertCircle,
  IconLoader2,
  IconUsers,
  IconMessage2,
  IconDeviceMobile,
  IconCircleCheck,
  IconUser,
  IconDots,
  IconPlayerPause,
  IconPlayerPlay,
  IconSquareCheck,
  IconChevronDown,
  IconChevronRight,
  IconBell,
  IconBellOff,
  IconCalendar,
  IconTemplate,
  IconCornerDownRight,
} from "@tabler/icons-react";
import { toast } from "sonner";
import Link from "next/link";
import { PaywallGate } from "@/components/billing/paywall-gate";

// ─── Types ─────────────────────────────────────────────────────────────────────

type SubFieldEntry = {
  label: string;
  value: string;
  confidence: number;
  extractedAt: number;
};

type CollectedField = {
  value: string | number;
  extractedAt: number;
  confidence: number;
  sourceMessageId?: string;
  subFields?: Record<string, SubFieldEntry>;
};

type ExtractedField = { fieldKey: string; value: string; confidence: number };

type MessageWithExtraction = {
  _id: Id<"messages">;
  text: string;
  timestamp: number;
  lineUserId: string;
  processingStatus: "pending" | "extracting" | "complete" | "failed";
  routingMethod?: string;
  extraction: {
    extractedFields: ExtractedField[];
    modelUsed: string;
    promptTokens: number;
    completionTokens: number;
    processingMs: number;
  } | null;
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; projectId: string }>;
}) {
  const { orgSlug, projectId } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const project = useQuery(
    api.projects.get,
    org ? { projectId: projectId as Id<"projects">, organizationId: org._id } : "skip"
  );
  const reminders = useQuery(
    api.reminders.listByProject,
    org ? { projectId: projectId as Id<"projects">, organizationId: org._id } : "skip"
  );

  const advanceStage = useMutation(api.projects.advanceStage);
  const skipStage = useMutation(api.projects.skipStage);
  const pauseProject = useMutation(api.projects.pause);
  const resumeProject = useMutation(api.projects.resume);
  const completeProject = useMutation(api.projects.complete);
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  if (project === undefined || org === undefined || org === null) return <DetailSkeleton />;
  if (project === null) {
    return (
      <div className="px-4 lg:px-6">
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  const completionPercent =
    project.stageStates.length > 0
      ? Math.round(
          (project.stageStates.filter(
            (s) => s.status === "completed" || s.status === "skipped"
          ).length /
            project.stageStates.length) *
            100
        )
      : 0;

  const activeState = project.stageStates.find((s) => s.status === "active");

  async function handleAdvance() {
    const ok = await confirmDialog({
      title: "Advance to next stage?",
      description: "The current stage will be marked complete and the next stage will begin.",
      confirmLabel: "Advance",
      variant: "default",
    });
    if (!ok) return;
    try {
      const result = await advanceStage({ projectId: project!._id, organizationId: org!._id });
      if ((result as { completed?: boolean }).completed) {
        toast.success("Project completed!");
      } else {
        toast.success(`Advanced to: ${(result as { nextStageName?: string }).nextStageName ?? "next stage"}`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to advance");
    }
  }

  async function handleSkip() {
    const ok = await confirmDialog({
      title: "Skip this stage?",
      description: "The current stage will be skipped and the next stage will begin.",
      confirmLabel: "Skip stage",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await skipStage({ projectId: project!._id, organizationId: org!._id });
      toast.success("Stage skipped");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to skip");
    }
  }

  async function handlePause() {
    const ok = await confirmDialog({
      title: "Pause AI processing?",
      description: "The agent will stop sending reminders and advancing stages for this project. You can resume at any time.",
      confirmLabel: "Pause",
      variant: "default",
    });
    if (!ok) return;
    try {
      await pauseProject({ projectId: project!._id, organizationId: org!._id });
      toast.success("Project paused — AI processing stopped");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to pause");
    }
  }

  async function handleResume() {
    const ok = await confirmDialog({
      title: "Resume project?",
      description: "The agent will resume sending reminders and processing messages for this project.",
      confirmLabel: "Resume",
      variant: "default",
    });
    if (!ok) return;
    try {
      await resumeProject({ projectId: project!._id, organizationId: org!._id });
      toast.success("Project resumed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to resume");
    }
  }

  async function handleComplete() {
    const ok = await confirmDialog({
      title: "Mark project as complete?",
      description: "All reminders will be cancelled and the project will be marked done. This cannot be undone easily.",
      confirmLabel: "Complete project",
      variant: "default",
    });
    if (!ok) return;
    try {
      await completeProject({ projectId: project!._id, organizationId: org!._id });
      toast.success("Project marked as complete");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to complete");
    }
  }

  const isActive = project.status === "active";
  const isPaused = project.status === "paused";
  const isCompleted = project.status === "completed" || project.status === "archived";

  return (
    <PaywallGate organizationId={org._id}>
    <div className="flex flex-col gap-0 px-4 lg:px-6">
      {ConfirmDialogNode}

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 py-4 border-b">
        <Link href={`/dashboard/${orgSlug}/projects`}>
          <Button variant="ghost" size="icon" className="size-8 mt-0.5 shrink-0">
            <IconArrowLeft className="size-4" />
          </Button>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-lg font-semibold leading-tight">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
            {project.groupChat && (
              <span className="flex items-center gap-1">
                <IconMessage2 className="size-3" />
                {project.groupChat.displayName}
              </span>
            )}
            {project.workflowTemplate && (
              <span className="flex items-center gap-1">
                <IconTemplate className="size-3" />
                {project.workflowTemplate.name}
              </span>
            )}
            {project.createdAt && (
              <span className="flex items-center gap-1">
                <IconCalendar className="size-3" />
                {new Date(project.createdAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Secondary actions dropdown */}
          {!isCompleted && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-8">
                  <IconDots className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isActive && (
                  <DropdownMenuItem onClick={handleSkip}>
                    <IconMinus className="size-4 mr-2" />
                    Skip current stage
                  </DropdownMenuItem>
                )}
                {isActive && <DropdownMenuSeparator />}
                {isActive && (
                  <DropdownMenuItem onClick={handlePause}>
                    <IconPlayerPause className="size-4 mr-2" />
                    Pause AI processing
                  </DropdownMenuItem>
                )}
                {isPaused && (
                  <DropdownMenuItem onClick={handleResume}>
                    <IconPlayerPlay className="size-4 mr-2" />
                    Resume project
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleComplete} className="text-green-600 focus:text-green-600">
                  <IconSquareCheck className="size-4 mr-2" />
                  Mark as complete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Primary action */}
          {isActive && (
            <Button size="sm" onClick={handleAdvance} className="gap-1.5">
              <IconArrowRight className="size-3.5" />
              Advance stage
            </Button>
          )}
          {isPaused && (
            <Button size="sm" variant="outline" onClick={handleResume} className="gap-1.5">
              <IconPlayerPlay className="size-3.5" />
              Resume
            </Button>
          )}
        </div>
      </div>

      {/* ── Progress bar + stepper ─────────────────────────────────────────────── */}
      <div className="py-4 border-b flex flex-col gap-3">
        {/* Linear progress */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isCompleted ? "bg-green-500" : isPaused ? "bg-yellow-500" : "bg-primary"
              }`}
              style={{ width: `${completionPercent}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground font-medium shrink-0">
            {completionPercent}%
          </span>
        </div>

        {/* Step pips */}
        <div className="flex items-start overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {project.stageStates.map((state, index) => (
            <Fragment key={state._id}>
              <StagePip
                status={state.status}
                order={state.stageOrder}
                name={state.template?.name ?? `Stage ${state.stageOrder}`}
              />
              {index < project.stageStates.length - 1 && (
                <div className="flex-1 max-w-10 h-px bg-border self-start mt-[14px] mx-1 min-w-2 shrink-0" />
              )}
            </Fragment>
          ))}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="workflow" className="flex flex-col gap-0 pt-4">
        <TabsList className="w-fit mb-4">
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
          <TabsTrigger value="chat">Chat history</TabsTrigger>
          <TabsTrigger value="team">Team & group</TabsTrigger>
        </TabsList>

        {/* ── Workflow tab ─────────────────────────────────────────────────── */}
        <TabsContent value="workflow" className="mt-0 flex flex-col gap-4">
          {/* Active stage — prominent */}
          {activeState && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/3 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border-b border-primary/20">
                <div className="size-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                  {activeState.stageOrder}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">
                    {activeState.template?.name ?? `Stage ${activeState.stageOrder}`}
                  </p>
                  {activeState.template?.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {activeState.template.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {activeState.reminderSentCount > 0 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <IconBell className="size-3" />
                      {activeState.reminderSentCount} sent
                    </div>
                  )}
                  <Badge variant="outline" className="text-xs text-primary border-primary/40">
                    Active
                  </Badge>
                </div>
              </div>
              <div className="px-4 py-3">
                <StageFieldsList
                  state={activeState}
                  orgId={org._id}
                  editable
                />
              </div>
            </div>
          )}

          {/* Other stages */}
          <div className="flex flex-col gap-2">
            {project.stageStates
              .filter((s) => s.status !== "active")
              .map((state) => (
                <CollapsibleStageRow
                  key={state._id}
                  state={state}
                  orgId={org._id}
                />
              ))}
          </div>

          {/* Reminders log */}
          {reminders && reminders.length > 0 && (
            <RemindersLog reminders={reminders} stageStates={project.stageStates} />
          )}
        </TabsContent>

        {/* ── Chat history tab ─────────────────────────────────────────────── */}
        <TabsContent value="chat" className="mt-0">
          <ChatHistory
            projectId={project._id}
            groupChatId={project.groupChatId}
            orgId={org._id}
          />
        </TabsContent>

        {/* ── Team & group tab ─────────────────────────────────────────────── */}
        <TabsContent value="team" className="flex flex-col gap-5 mt-0">
          {project.groupChat && (
            <GroupInfoCard group={project.groupChat} />
          )}
          <RoleMappingsPanel
            templateId={project.workflowTemplateId}
            groupChatId={project.groupChatId}
            orgId={org._id}
          />
        </TabsContent>
      </Tabs>
    </div>
    </PaywallGate>
  );
}

// ─── Collapsible stage row (completed / pending / skipped) ───────────────────

function CollapsibleStageRow({
  state,
  orgId,
}: {
  state: any;
  orgId: Id<"organizations">;
}) {
  const [open, setOpen] = useState(false);
  const template = state.template;
  const collectedFields = (state.collectedFields ?? {}) as Record<string, CollectedField>;
  const requiredFields = template?.requiredFields ?? [];
  const filledCount = requiredFields.filter((f: any) => f.key in collectedFields).length;
  const totalCount = requiredFields.length;

  const statusConfig = {
    completed: {
      icon: <IconCheck className="size-3.5 text-green-600" />,
      badge: <span className="text-xs text-green-600 font-medium">Done</span>,
      ring: "border-green-200 dark:border-green-800/50",
      bg: "bg-green-50/50 dark:bg-green-950/10",
    },
    skipped: {
      icon: <IconMinus className="size-3.5 text-muted-foreground" />,
      badge: <span className="text-xs text-muted-foreground">Skipped</span>,
      ring: "border-border",
      bg: "bg-muted/20",
    },
    pending: {
      icon: <span className="text-xs text-muted-foreground font-medium">{state.stageOrder}</span>,
      badge: <span className="text-xs text-muted-foreground">Pending</span>,
      ring: "border-border",
      bg: "",
    },
  }[state.status as string] ?? {
    icon: <IconCircle className="size-3.5" />,
    badge: null,
    ring: "border-border",
    bg: "",
  };

  return (
    <div className={`rounded-xl border overflow-hidden ${statusConfig.ring} ${statusConfig.bg}`}>
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className={`size-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
          state.status === "completed"
            ? "border-green-500 bg-green-50 dark:bg-green-950/30"
            : state.status === "skipped"
            ? "border-muted-foreground/30 bg-muted"
            : "border-border bg-background"
        }`}>
          {statusConfig.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${state.status === "pending" ? "text-muted-foreground" : ""}`}>
            {template?.name ?? `Stage ${state.stageOrder}`}
          </p>
          {template?.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {template.description}
            </p>
          )}
          {totalCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {filledCount}/{totalCount} field{totalCount !== 1 ? "s" : ""} collected
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {statusConfig.badge}
          {state.reminderSentCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <IconBell className="size-3" />
              {state.reminderSentCount}
            </div>
          )}
          {state.completedAt && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              {new Date(state.completedAt).toLocaleDateString()}
            </span>
          )}
          {open ? (
            <IconChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <IconChevronRight className="size-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <>
          <Separator />
          <div className="px-4 py-3">
            <StageFieldsList state={state} orgId={orgId} editable />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Stage fields list ────────────────────────────────────────────────────────

function StageFieldsList({
  state,
  orgId,
  editable,
}: {
  state: any;
  orgId: Id<"organizations">;
  editable: boolean;
}) {
  const collectedFields = (state.collectedFields ?? {}) as Record<string, CollectedField>;
  const requiredFields = (state.template?.requiredFields ?? []) as Array<{
    key: string;
    label: string;
    isRequired: boolean;
  }>;

  if (requiredFields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-1">No fields required for this stage.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {requiredFields.map((field) => (
        <FieldRow
          key={field.key}
          field={field}
          collected={collectedFields[field.key]}
          stageStateId={state._id}
          orgId={orgId}
          editable={editable}
        />
      ))}
    </div>
  );
}

// ─── Reminders log ───────────────────────────────────────────────────────────

function RemindersLog({
  reminders,
  stageStates,
}: {
  reminders: Array<{
    _id: string;
    stageStateId: Id<"projectStageStates">;
    status: string;
    scheduledFor: number;
    sentAt?: number;
    cancelledAt?: number;
    cancelReason?: string;
  }>;
  stageStates: any[];
}) {
  const stageByStateId = Object.fromEntries(
    stageStates.map((s) => [s._id as string, s])
  );

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <IconBell className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Reminders</span>
        <Badge variant="secondary" className="text-xs ml-1">{reminders.length}</Badge>
      </div>
      <div className="flex flex-col divide-y">
        {reminders.map((r) => {
          const stage = stageByStateId[r.stageStateId as string];
          const stageName = stage?.template?.name ?? `Stage ${stage?.stageOrder ?? "?"}`;
          const ts = r.sentAt ?? r.cancelledAt ?? r.scheduledFor;
          const statusConfig = {
            sent: { icon: <IconBell className="size-3.5 text-blue-500" />, label: "Sent", color: "text-blue-600" },
            scheduled: { icon: <IconClock className="size-3.5 text-muted-foreground" />, label: "Scheduled", color: "text-muted-foreground" },
            cancelled: { icon: <IconBellOff className="size-3.5 text-muted-foreground" />, label: "Cancelled", color: "text-muted-foreground" },
            failed: { icon: <IconAlertCircle className="size-3.5 text-destructive" />, label: "Failed", color: "text-destructive" },
          }[r.status] ?? { icon: <IconClock className="size-3.5" />, label: r.status, color: "" };

          return (
            <div key={r._id} className="flex items-center gap-3 px-4 py-2.5">
              {statusConfig.icon}
              <div className="flex-1 min-w-0">
                <span className="text-sm">{stageName}</span>
                {r.cancelReason && (
                  <span className="text-xs text-muted-foreground ml-2">· {r.cancelReason}</span>
                )}
              </div>
              <span className={`text-xs shrink-0 ${statusConfig.color}`}>{statusConfig.label}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Chat history tab ─────────────────────────────────────────────────────────

function ChatHistory({
  projectId,
  groupChatId,
  orgId,
}: {
  projectId: Id<"projects">;
  groupChatId: Id<"groupChats">;
  orgId: Id<"organizations">;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.chatFeedByProjectPaginated,
    { projectId, organizationId: orgId },
    { initialNumItems: 30 }
  );

  const knownUsers = useQuery(api.userLineProfiles.listByGroup, {
    groupChatId,
    organizationId: orgId,
  });

  const profileById = Object.fromEntries(
    (knownUsers ?? []).map((u) => [u.lineUserId, u])
  );

  if (status === "LoadingFirstPage") {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-2">
            <Skeleton className="size-7 rounded-full shrink-0" />
            <Skeleton className={`h-12 rounded-2xl ${i % 2 === 0 ? "w-1/2" : "w-2/3"}`} />
          </div>
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center rounded-xl border">
        <IconMessage className="size-10 text-muted-foreground/30" />
        <p className="text-sm font-medium">No messages yet</p>
        <p className="text-xs text-muted-foreground">Messages from the LINE group will appear here.</p>
      </div>
    );
  }

  const orderedMessages = [...results].reverse() as unknown as MessageWithExtraction[];

  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      <div className="flex flex-col gap-0.5 p-4 max-h-[70vh] overflow-y-auto">
        {status === "CanLoadMore" && (
          <div className="flex justify-center pb-3">
            <Button variant="outline" size="sm" onClick={() => loadMore(30)}>
              Load older messages
            </Button>
          </div>
        )}
        {status === "LoadingMore" && (
          <div className="flex justify-center pb-3">
            <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {orderedMessages.map((msg) => (
          <ProjectChatBubble key={msg._id} message={msg} profileById={profileById} />
        ))}
      </div>
    </div>
  );
}

function ProjectChatBubble({
  message,
  profileById,
}: {
  message: MessageWithExtraction;
  profileById: Record<string, { displayName: string; pictureUrl: string | null }>;
}) {
  const isSystemEdit = message.lineUserId === "system:dashboard";
  const isBot = message.lineUserId === "system:bot";
  const relevantFields = message.extraction?.extractedFields.filter((f) => f.confidence >= 0.9 ) ?? [];
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const profile = profileById[message.lineUserId];
  const displayName = profile?.displayName ?? (isSystemEdit || isBot ? null : `…${message.lineUserId.slice(-8)}`);

  if (isSystemEdit) {
    return (
      <div className="flex justify-center py-1.5 my-1">
        <div className="flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-2.5 py-0.5 text-xs max-w-[85%]">
          <IconPencil className="size-2.5 text-green-600 dark:text-green-400 shrink-0" />
          <span className="text-green-700 dark:text-green-300 text-center leading-snug">
            {message.text.replace("[Dashboard] ", "")}
          </span>
        </div>
      </div>
    );
  }

  if (isBot) {
    return (
      <div className="flex items-start gap-2 py-0.5 justify-end group">
        <div className="flex flex-col items-end min-w-0 max-w-[75%]">
          <p className="text-[11px] text-muted-foreground font-medium mb-0.5">Bot</p>
          <div className="flex items-end gap-2 flex-row-reverse">
            <div className="rounded-2xl rounded-tr-sm bg-blue-500 text-white px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
              {message.text}
            </div>
            <span className="text-xs text-muted-foreground/60 shrink-0 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {time}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const processingIndicator = {
    pending: <IconClock className="size-3 text-muted-foreground/40 animate-pulse" />,
    extracting: <IconBrain className="size-3 text-blue-400 animate-pulse" />,
    complete: null,
    failed: <IconAlertCircle className="size-3 text-destructive/60" />,
  }[message.processingStatus as string];

  return (
    <div className="flex items-start gap-2 py-0.5 group">
      <div className={`size-7 rounded-full flex items-center justify-center shrink-0 overflow-hidden text-white text-xs font-bold mt-0.5 ${!profile?.pictureUrl ? getUserColor(message.lineUserId) : ""}`}>
        {profile?.pictureUrl ? (
          <img src={profile.pictureUrl} alt={displayName ?? ""} className="w-full h-full object-cover" />
        ) : (
          <IconUser className="size-3.5" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {displayName && <p className="text-[11px] text-muted-foreground font-medium truncate">{displayName}</p>}
          <span className="text-[10px] text-muted-foreground/50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{time}</span>
          {processingIndicator && <span className="shrink-0">{processingIndicator}</span>}
          {message.routingMethod === "ai" && (
            <Badge variant="outline" className="text-[10px] py-0 h-3.5 shrink-0">AI</Badge>
          )}
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm leading-relaxed">
          {message.text}
        </div>
        {relevantFields.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 ml-1 items-center">
            {relevantFields.map((f) => (
              <div key={f.fieldKey} className="flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-2 py-0.5 text-xs">
                <IconBrain className="size-2.5 text-blue-500 shrink-0" />
                <span className="text-blue-700 dark:text-blue-300 font-medium">{f.fieldKey}</span>
                <span className="text-blue-600 dark:text-blue-400">→ {f.value}</span>
                <span className="text-blue-400">{Math.round(f.confidence * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Group info card ──────────────────────────────────────────────────────────

function GroupInfoCard({ group }: { group: { displayName: string; lineGroupId: string; isActive: boolean; connectedAt: number } }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <IconMessage2 className="size-4 text-muted-foreground" />
          Group chat
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5 pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center">
              <IconDeviceMobile className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{group.displayName}</p>
              <p className="text-xs text-muted-foreground font-mono">{group.lineGroupId.slice(0, 20)}…</p>
            </div>
          </div>
          <Badge className={group.isActive ? "bg-green-500/15 text-green-700 dark:text-green-300" : "bg-muted text-muted-foreground"}>
            {group.isActive ? (
              <span className="flex items-center gap-1"><IconCircleCheck className="size-3" /> Connected</span>
            ) : "Inactive"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Connected {new Date(group.connectedAt).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Role mappings panel ──────────────────────────────────────────────────────

function RoleMappingsPanel({
  templateId,
  groupChatId,
  orgId,
}: {
  templateId: Id<"workflowTemplates">;
  groupChatId: Id<"groupChats">;
  orgId: Id<"organizations">;
}) {
  const context = useQuery(api.groupChatRoleMappings.getProjectCreationContext, {
    templateId,
    groupChatId,
    organizationId: orgId,
  });
  const upsertMappings = useMutation(api.groupChatRoleMappings.upsertMany);
  const [editing, setEditing] = useState(false);
  const [draftMappings, setDraftMappings] = useState<Array<{ roleId: string; lineUserId: string }>>([]);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    if (!context) return;
    setDraftMappings(context.roles.map((r) => ({ roleId: r.roleId, lineUserId: r.assignedLineUserId ?? "" })));
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const valid = draftMappings.filter((m) => m.lineUserId.trim()).map((m) => ({
        roleId: m.roleId as Id<"roles">,
        lineUserId: m.lineUserId.trim(),
      }));
      await upsertMappings({ organizationId: orgId, groupChatId, mappings: valid });
      toast.success("Role assignments saved");
      setEditing(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (context === undefined) return <Skeleton className="h-32 rounded-xl" />;

  const teamNames = Array.from(new Set(context.roles.map((r) => r.teamName ?? "General")));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <IconUsers className="size-4 text-muted-foreground" />
            Role assignments
          </div>
          {context.roles.length > 0 && !editing && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={startEdit}>
              <IconPencil className="size-3 mr-1" /> Edit
            </Button>
          )}
          {editing && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
                {saving && <IconLoader2 className="size-3 animate-spin mr-1" />}
                Save
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 flex flex-col gap-3">
        {context.roles.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">This workflow template has no role-based stages.</p>
        ) : (
          <Tabs defaultValue={teamNames[0]} className="flex flex-col gap-3">
            {teamNames.length > 1 && (
              <TabsList className="w-fit">
                {teamNames.map((name) => (
                  <TabsTrigger key={name} value={name} className="text-xs">{name}</TabsTrigger>
                ))}
              </TabsList>
            )}
            {teamNames.map((name) => (
              <TabsContent key={name} value={name} className="flex flex-col gap-3 mt-0">
                {context.roles.map((role, i) => {
                  if ((role.teamName ?? "General") !== name) return null;
                  return editing ? (
                    <RoleEditRow
                      key={role.roleId}
                      role={role}
                      lineUserId={draftMappings[i]?.lineUserId ?? ""}
                      knownUsers={context.knownUsers}
                      onChange={(v) => setDraftMappings((prev) => { const next = [...prev]; next[i] = { roleId: role.roleId, lineUserId: v }; return next; })}
                    />
                  ) : (
                    <RoleViewRow key={role.roleId} role={role} knownUsers={context.knownUsers} />
                  );
                })}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Role rows ────────────────────────────────────────────────────────────────

function RoleViewRow({ role, knownUsers }: {
  role: { roleId: string; roleName: string; teamName: string | null; stageCount: number; assignedLineUserId: string | null };
  knownUsers: Array<{ lineUserId: string; displayName: string }>;
}) {
  const assigned = role.assignedLineUserId
    ? knownUsers.find((u) => u.lineUserId === role.assignedLineUserId)?.displayName ?? "Unknown user"
    : null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{role.roleName}</span>
          {role.teamName && <span className="text-xs text-muted-foreground">· {role.teamName}</span>}
        </div>
        <span className="text-xs text-muted-foreground">{role.stageCount} stage{role.stageCount !== 1 ? "s" : ""}</span>
      </div>
      {assigned ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center">
            <IconUsers className="size-3 text-primary" />
          </div>
          <span className="text-sm">{assigned}</span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground italic shrink-0">Unassigned</span>
      )}
    </div>
  );
}

function RoleEditRow({ role, lineUserId, knownUsers, onChange }: {
  role: { roleId: string; roleName: string; teamName: string | null; stageCount: number };
  lineUserId: string;
  knownUsers: Array<{ lineUserId: string; displayName: string; pictureUrl: string | null }>;
  onChange: (v: string) => void;
}) {
  const [showManual, setShowManual] = useState(!!lineUserId && !knownUsers.some((u) => u.lineUserId === lineUserId));
  return (
    <div className="rounded-lg border px-3 py-2.5 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium truncate">{role.roleName}</span>
          {role.teamName && <span className="text-xs text-muted-foreground shrink-0">· {role.teamName}</span>}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{role.stageCount} stage{role.stageCount !== 1 ? "s" : ""}</span>
      </div>
      {showManual ? (
        <div className="flex gap-2">
          <Input className="font-mono text-xs h-8" placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" value={lineUserId} onChange={(e) => onChange(e.target.value)} autoFocus />
          <Button type="button" variant="ghost" size="sm" className="shrink-0 h-8 text-xs px-2" onClick={() => { setShowManual(false); onChange(""); }}>← Pick</Button>
        </div>
      ) : knownUsers.length === 0 ? (
        <Select disabled value="__none__">
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="No participants found yet" /></SelectTrigger>
          <SelectContent><SelectItem value="__none__">No participants found yet</SelectItem></SelectContent>
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

// ─── Stage pip ────────────────────────────────────────────────────────────────

function StagePip({ status, order, name }: { status: string; order: number; name: string }) {
  const icon = {
    completed: <IconCheck className="size-3" />,
    active: <span className="text-xs font-bold">{order}</span>,
    pending: <span className="text-xs text-muted-foreground">{order}</span>,
    skipped: <IconMinus className="size-3" />,
  }[status] ?? <IconCircle className="size-3" />;

  const classes = {
    completed: "bg-green-500 text-white border-green-500",
    active: "bg-primary text-primary-foreground border-primary ring-2 ring-primary/30",
    pending: "bg-background text-muted-foreground border-border",
    skipped: "bg-muted text-muted-foreground border-muted-foreground/30",
  }[status] ?? "";

  return (
    <div className="flex flex-col items-center gap-1 shrink-0 w-20" title={name}>
      <div className={`size-7 rounded-full border-2 flex items-center justify-center ${classes}`}>{icon}</div>
      <span className="text-[10px] text-muted-foreground text-center leading-tight px-1 line-clamp-2">{name}</span>
    </div>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────

function FieldRow({
  field,
  collected,
  stageStateId,
  orgId,
  editable,
}: {
  field: { key: string; label: string; isRequired: boolean };
  collected?: CollectedField;
  stageStateId: Id<"projectStageStates">;
  orgId: Id<"organizations">;
  editable: boolean;
}) {
  const updateField = useMutation(api.projectStageStates.updateField);
  const clearField = useMutation(api.projectStageStates.clearField);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  async function handleSave() {
    if (!draft.trim()) return;
    try {
      await updateField({ organizationId: orgId, stageStateId, fieldKey: field.key, value: draft.trim(), fieldLabel: field.label });
      setEditing(false);
      toast.success("Field saved");
    } catch { toast.error("Failed to save field"); }
  }

  async function handleClear() {
    try {
      await clearField({ organizationId: orgId, stageStateId, fieldKey: field.key, fieldLabel: field.label });
    } catch { toast.error("Failed to clear field"); }
  }

  const isFilled = !!collected;
  const isAiExtracted = isFilled && collected.confidence < 1.0;
  const subFieldEntries = collected?.subFields ? Object.entries(collected.subFields) : [];
  const isComposite = subFieldEntries.length > 1 || (subFieldEntries.length === 1 && subFieldEntries[0][0] !== "value");

  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isFilled ? "bg-background border" : "border border-dashed border-muted-foreground/25 bg-muted/20"}`}>
      <div className="shrink-0">
        {isFilled ? (
          <IconCheck className="size-4 text-green-500" />
        ) : (
          <IconCircle className="size-4 text-muted-foreground/30" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">{field.label}</span>
          {field.isRequired && <span className="text-destructive text-xs">*</span>}
          {isAiExtracted && !editing && !isComposite && (
            <Badge variant="outline" className="text-[10px] py-0 h-4 shrink-0 text-blue-600 border-blue-300 ml-1">
              <IconBrain className="size-2.5 mr-0.5" />
              AI {Math.round(collected.confidence * 100)}%
            </Badge>
          )}
          {isComposite && !editing && (
            <Badge variant="outline" className="text-[10px] py-0 h-4 shrink-0 text-muted-foreground ml-1">
              {subFieldEntries.length} parts
            </Badge>
          )}
        </div>
        {isFilled && !editing && !isComposite && (
          <p className="font-medium truncate">{String(collected.value)}</p>
        )}
        {isComposite && !editing && (
          <div className="flex flex-col gap-1 mt-1.5">
            {subFieldEntries.map(([subKey, sf]) => (
              <SubFieldRow
                key={subKey}
                fieldKey={field.key}
                fieldLabel={field.label}
                subKey={subKey}
                subField={sf}
                stageStateId={stageStateId}
                orgId={orgId}
                editable={editable}
              />
            ))}
          </div>
        )}
        {editing && (
          <Input
            className="h-7 mt-1 text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
          />
        )}
      </div>
      {editable && (
        <div className="flex gap-1 shrink-0">
          {editing ? (
            <>
              <Button size="icon" variant="ghost" className="size-6" onClick={handleSave}>
                <IconCheck className="size-3 text-green-500" />
              </Button>
              <Button size="icon" variant="ghost" className="size-6" onClick={() => setEditing(false)}>
                <IconX className="size-3" />
              </Button>
            </>
          ) : (
            <>
              <Button size="icon" variant="ghost" className="size-6"
                onClick={() => { setDraft(collected ? String(collected.value) : ""); setEditing(true); }}>
                <IconPencil className="size-3" />
              </Button>
              {isFilled && (
                <Button size="icon" variant="ghost" className="size-6 text-destructive/60 hover:text-destructive" onClick={handleClear}>
                  <IconX className="size-3" />
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-field row (one attribute of a composite field, e.g. "Material" under "Roof description") ────

function SubFieldRow({
  fieldKey,
  fieldLabel,
  subKey,
  subField,
  stageStateId,
  orgId,
  editable,
}: {
  fieldKey: string;
  fieldLabel: string;
  subKey: string;
  subField: SubFieldEntry;
  stageStateId: Id<"projectStageStates">;
  orgId: Id<"organizations">;
  editable: boolean;
}) {
  const updateField = useMutation(api.projectStageStates.updateField);
  const clearField = useMutation(api.projectStageStates.clearField);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  async function handleSave() {
    if (!draft.trim()) return;
    try {
      await updateField({
        organizationId: orgId,
        stageStateId,
        fieldKey,
        value: draft.trim(),
        fieldLabel,
        subKey,
        subLabel: subField.label,
      });
      setEditing(false);
      toast.success("Field saved");
    } catch { toast.error("Failed to save field"); }
  }

  async function handleClear() {
    try {
      await clearField({ organizationId: orgId, stageStateId, fieldKey, fieldLabel, subKey });
    } catch { toast.error("Failed to clear field"); }
  }

  return (
    <div className="flex items-center gap-2 text-xs min-w-0">
      <IconCornerDownRight className="size-3 text-muted-foreground/40 shrink-0" />
      <span className="text-muted-foreground shrink-0 min-w-[72px] truncate">{subField.label}</span>
      {editing ? (
        <Input
          className="h-6 text-xs flex-1 min-w-0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          autoFocus
        />
      ) : (
        <span className="font-medium truncate flex-1">{subField.value}</span>
      )}
      {subField.confidence < 1.0 && !editing && (
        <Badge variant="outline" className="text-[10px] py-0 h-4 shrink-0 text-blue-600 border-blue-300">
          <IconBrain className="size-2.5 mr-0.5" />
          {Math.round(subField.confidence * 100)}%
        </Badge>
      )}
      {editable && (
        <div className="flex gap-0.5 shrink-0">
          {editing ? (
            <>
              <Button size="icon" variant="ghost" className="size-5" onClick={handleSave}>
                <IconCheck className="size-3 text-green-500" />
              </Button>
              <Button size="icon" variant="ghost" className="size-5" onClick={() => setEditing(false)}>
                <IconX className="size-3" />
              </Button>
            </>
          ) : (
            <>
              <Button size="icon" variant="ghost" className="size-5" onClick={() => { setDraft(subField.value); setEditing(true); }}>
                <IconPencil className="size-3" />
              </Button>
              <Button size="icon" variant="ghost" className="size-5 text-destructive/60 hover:text-destructive" onClick={handleClear}>
                <IconX className="size-3" />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-300/50" },
    completed: { label: "Completed", className: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-300/50" },
    paused: { label: "Paused — AI off", className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-300/50" },
    archived: { label: "Archived", className: "bg-muted text-muted-foreground" },
  };
  const { label, className } = config[status] ?? { label: status, className: "" };
  return <Badge variant="outline" className={`text-xs ${className}`}>{label}</Badge>;
}

// ─── Shared utilities ─────────────────────────────────────────────────────────

function getUserColor(userId: string): string {
  const palette = [
    "bg-rose-400", "bg-orange-400", "bg-amber-400", "bg-emerald-400",
    "bg-teal-400", "bg-cyan-500", "bg-blue-400", "bg-violet-400", "bg-pink-400",
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="flex items-center gap-3 py-4">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-5 w-16 rounded-full ml-1" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="size-7 rounded-full" />)}
      </div>
      <Skeleton className="h-9 w-64 rounded-lg" />
      {[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
    </div>
  );
}

"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { usePaginatedQuery, useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  IconArrowLeft,
  IconMessage2,
  IconFolderOpen,
  IconCheck,
  IconCircle,
  IconMinus,
  IconChevronDown,
  IconBrain,
  IconUser,
  IconPencil,
  IconX,
  IconLoader2,
  IconCircleCheck,
  IconPlayerSkipForward,
  IconMoodSmile,
  IconPaperclip,
  IconPhoto,
  IconSend,
  IconSparkles,
  IconChevronRight,
  IconAlertCircle,
  IconDatabase,
  IconPlus,
  IconSearch,
  IconPlayerPause,
  IconPlayerPlay,
  IconSquareCheck,
  IconDots,
  IconUsers,
  IconLayoutList,
  IconBell,
  IconClock,
  IconTrash,
  IconDoorExit,
} from "@tabler/icons-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import dynamic from "next/dynamic";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CreditBadge } from "@/components/billing/credit-usage";
import { PaywallGate } from "@/components/billing/paywall-gate";

// ─── Types ────────────────────────────────────────────────────────────────────

type CollectedField = {
  value: string | number;
  extractedAt: number;
  confidence: number;
  sourceMessageId?: string;
};

type ExtractedField = { fieldKey: string; value: string; confidence: number };

type ChatMessage = {
  _id: Id<"messages">;
  text: string;
  timestamp: number;
  lineUserId: string;
  processingStatus: string;
  messageType: string;
  storageId?: Id<"_storage">;
  imageUrl?: string | null;
  projectId?: Id<"projects">;
  routingMethod?: string;
  sentByName?: string;
  intent?: string;
  aiTraceId?: Id<"aiTraces">;
  extraction: {
    extractedFields: ExtractedField[];
    modelUsed: string;
    promptTokens: number;
    completionTokens: number;
  } | null;
};

type StageWithTemplate = {
  _id: Id<"projectStageStates">;
  stageOrder: number;
  status: "pending" | "active" | "completed" | "skipped";
  collectedFields: Record<string, CollectedField> | null;
  template: {
    name: string;
    description?: string;
    requiredFields: Array<{ key: string; label: string; type: string; isRequired: boolean }>;
  } | null;
};

type ProjectWithStages = {
  _id: Id<"projects">;
  name: string;
  status: "active" | "completed" | "archived" | "paused";
  currentStageOrder: number;
  workflowTemplateId: Id<"workflowTemplates">;
  stageStates: StageWithTemplate[];
};

type UserProfile = {
  lineUserId: string;
  displayName: string;
  pictureUrl: string | null;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GroupDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; groupId: string }>;
}) {
  const { orgSlug, groupId } = use(params);
  const router = useRouter();
  const org = useQuery(api.organizations.get, { slug: orgSlug });

  const group = useQuery(
    api.groupChats.get,
    org ? { groupChatId: groupId as Id<"groupChats">, organizationId: org._id } : "skip"
  );

  const { results: rawMessages, status: msgStatus, loadMore } = usePaginatedQuery(
    api.messages.chatFeedByGroupPaginated,
    org ? { groupChatId: groupId as Id<"groupChats">, organizationId: org._id } : "skip",
    { initialNumItems: 50 }
  );

  const projects = useQuery(
    api.projects.listByGroupWithStages,
    org ? { groupChatId: groupId as Id<"groupChats">, organizationId: org._id } : "skip"
  ) as ProjectWithStages[] | undefined;

  const userProfiles = useQuery(
    api.userLineProfiles.listByGroup,
    org ? { groupChatId: groupId as Id<"groupChats">, organizationId: org._id } : "skip"
  ) as UserProfile[] | undefined;

  const refreshProfiles = useAction(api.userLineProfiles.refreshGroupProfiles);

  const templates = useQuery(
    api.workflowTemplates.list,
    org ? { organizationId: org._id } : "skip"
  );

  const { confirmDialog, ConfirmDialogNode } = useConfirm();
  const leaveGroupAction = useAction(api.groupChats.leaveGroup);
  const [leaving, setLeaving] = useState(false);

  const [projectSearch, setProjectSearch] = useState("");
  const [showCreateProject, setShowCreateProject] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef(0);
  const isInitialLoad = useRef(true);

  // Oldest-first display order (rawMessages is newest-first from paginated query)
  const messages = [...(rawMessages as ChatMessage[])].reverse();

  // Scroll to bottom on first load; restore position after loading more
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el || messages.length === 0) return;
    if (isInitialLoad.current) {
      el.scrollTop = el.scrollHeight;
      isInitialLoad.current = false;
    } else if (prevScrollHeight.current > 0) {
      el.scrollTop = el.scrollHeight - prevScrollHeight.current;
      prevScrollHeight.current = 0;
    }
  }, [messages.length]);

  // Fetch LINE display names for group members that lack stored profiles
  useEffect(() => {
    if (!group || !org) return;
    refreshProfiles({
      groupChatId: groupId as Id<"groupChats">,
      organizationId: org._id,
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?._id, org?._id]);

  // Auto-load older messages when user scrolls near the top
  const handleChatScroll = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    if (el.scrollTop < 150 && msgStatus === "CanLoadMore") {
      prevScrollHeight.current = el.scrollHeight;
      loadMore(30);
    }
  }, [msgStatus, loadMore]);

  if (!org || group === undefined || projects === undefined || msgStatus === "LoadingFirstPage") {
    return <DetailSkeleton />;
  }

  if (group === null) {
    return (
      <div className="px-4 lg:px-6 py-8 text-muted-foreground">
        Group not found.
      </div>
    );
  }

  async function handleLeaveGroup() {
    if (!org || !group) return;
    const ok = await confirmDialog({
      title: `Leave "${group.displayName}"?`,
      description:
        "The bot will leave this LINE group and stop monitoring it. Past messages will be preserved in the archive.",
      confirmLabel: "Leave group",
      variant: "destructive" as const,
    });
    if (!ok) return;
    setLeaving(true);
    try {
      await leaveGroupAction({
        organizationId: org._id,
        groupChatId: groupId as Id<"groupChats">,
      });
      toast.success("Left group — archived.");
      router.push(`/dashboard/${orgSlug}/groups`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to leave group");
    } finally {
      setLeaving(false);
    }
  }

  const profileById: Record<string, UserProfile> = Object.fromEntries(
    (userProfiles ?? []).map((p) => [p.lineUserId, p])
  );
  const projectById = Object.fromEntries(projects.map((p) => [p._id as string, p]));
  const activeProjectCount = projects.filter((p) => p.status === "active").length;

  return (
    <PaywallGate organizationId={org._id}>
    <div
      className="-my-4 md:-my-6 flex flex-col overflow-hidden"
      style={{ height: "calc(100dvh - 48px)" }}
    >
      {/* ── Header bar ── */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b bg-background shrink-0">
        <Link href={`/dashboard/${orgSlug}/groups`}>
          <button className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <IconArrowLeft className="size-4" />
          </button>
        </Link>

        {group.pictureUrl ? (
          <img
            src={group.pictureUrl}
            alt={group.displayName}
            className="size-8 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <IconMessage2 className="size-4 text-muted-foreground" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm truncate">{group.displayName}</p>
            <Badge
              variant={group.isActive ? "default" : "secondary"}
              className="text-xs shrink-0"
            >
              {group.isActive ? "Active" : "Archived"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono">{group.lineGroupId}</p>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
          <span className="flex items-center gap-1">
            <IconFolderOpen className="size-3.5" />
            {activeProjectCount} project{activeProjectCount !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1">
            <IconMessage2 className="size-3.5" />
            {messages.length} msg{messages.length !== 1 ? "s" : ""}
          </span>
          <CreditBadge organizationId={org._id} />
          {group.isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-7 px-2 gap-1.5"
              onClick={handleLeaveGroup}
              disabled={leaving}
              title="Leave group"
            >
              <IconDoorExit className="size-3.5" />
              <span className="hidden sm:inline text-xs">Leave</span>
            </Button>
          )}
        </div>
      </div>
      {ConfirmDialogNode}

      {/* ── Split panel — mobile: projects top / chat bottom; desktop: chat left / projects right ── */}
      <div className="flex flex-col-reverse md:flex-row flex-1 min-h-0 overflow-hidden">
        {/* ── Chat feed + compose — flex-1 on both axes ── */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden md:border-r border-t md:border-t-0">
          <div className="shrink-0 border-b px-4 py-2 bg-muted/30">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Chat History
            </p>
          </div>
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
            onScroll={handleChatScroll}
          >
            {msgStatus === "LoadingMore" && (
              <div className="flex justify-center py-2">
                <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {msgStatus === "CanLoadMore" && messages.length > 0 && (
              <div className="flex justify-center py-1">
                <button
                  onClick={() => {
                    prevScrollHeight.current = chatContainerRef.current?.scrollHeight ?? 0;
                    loadMore(30);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ↑ Scroll up for older messages
                </button>
              </div>
            )}
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                <IconMessage2 className="size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No messages yet</p>
              </div>
            ) : (
              <MessageList messages={messages} projects={projects ?? []} profileById={profileById} organizationId={org._id} />
            )}
          </div>
          <ComposeBar
            groupChatId={groupId as Id<"groupChats">}
            organizationId={org._id}
            orgSlug={orgSlug}
            isActive={group.isActive}
          />
        </div>

        {/* ── Projects panel — full width on mobile (top half), 400px sidebar on desktop ── */}
        <div className="flex flex-col flex-1 md:flex-none md:w-[400px] shrink-0 overflow-hidden md:border-l border-b md:border-b-0">
          <div className="shrink-0 border-b px-4 py-2 bg-muted/30 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
              Projects
            </p>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <Link
                href={`/dashboard/${orgSlug}/projects?groupId=${groupId}`}
                className="text-xs text-muted-foreground hover:text-foreground shrink-0"
              >
                View all
              </Link>
              {(templates?.length ?? 0) > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => setShowCreateProject(true)}
                >
                  <IconPlus className="size-3" />
                  Add
                </Button>
              )}
            </div>
          </div>

          {/* Search bar */}
          {projects.length > 0 && (
            <div className="shrink-0 px-3 pt-2 pb-1">
              <div className="relative">
                <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search projects…"
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="pl-7 h-7 text-xs"
                />
                {projectSearch && (
                  <button
                    onClick={() => setProjectSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <IconX className="size-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
                <IconFolderOpen className="size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No projects in this group</p>
                {(templates?.length ?? 0) > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1"
                    onClick={() => setShowCreateProject(true)}
                  >
                    <IconPlus className="size-3.5" /> Create first project
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Type <code className="bg-muted px-1 rounded">/new-project NAME</code> in LINE to create one
                  </p>
                )}
              </div>
            ) : (() => {
              const filtered = projects.filter((p) =>
                !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase())
              );
              if (filtered.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center h-24 gap-1 text-center">
                    <p className="text-xs text-muted-foreground">No projects match "{projectSearch}"</p>
                  </div>
                );
              }
              return (
                <>
                  {filtered
                    .filter((p) => p.status === "active")
                    .map((p) => (
                      <ProjectCard key={p._id} project={p} orgSlug={orgSlug} orgId={org._id} groupChatId={groupId as Id<"groupChats">} defaultOpen />
                    ))}
                  {filtered
                    .filter((p) => p.status !== "active")
                    .map((p) => (
                      <ProjectCard key={p._id} project={p} orgSlug={orgSlug} orgId={org._id} groupChatId={groupId as Id<"groupChats">} defaultOpen={false} />
                    ))}
                </>
              );
            })()}
          </div>
        </div>

        {/* Add project modal */}
        {org && group && (templates?.length ?? 0) > 0 && showCreateProject && (
          <AddProjectModal
            open={showCreateProject}
            onClose={() => setShowCreateProject(false)}
            orgId={org._id}
            orgSlug={orgSlug}
            groupChatId={groupId as Id<"groupChats">}
            groupName={group.displayName}
            templates={templates ?? []}
          />
        )}
      </div>
    </div>
    </PaywallGate>
  );
}

// ─── Chat message list with date dividers ─────────────────────────────────────

function MessageList({
  messages,
  projects,
  profileById,
  organizationId,
}: {
  messages: ChatMessage[];
  projects: ProjectWithStages[];
  profileById: Record<string, UserProfile>;
  organizationId: Id<"organizations">;
}) {
  let lastDate = "";
  const projectById = Object.fromEntries(projects.map((p) => [p._id as string, p]));

  return (
    <>
      {messages.map((msg) => {
        const msgDate = new Date(msg.timestamp).toLocaleDateString([], {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        const showDivider = msgDate !== lastDate;
        lastDate = msgDate;

        return (
          <div key={msg._id}>
            {showDivider && (
              <div className="flex items-center gap-2 py-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium px-2 shrink-0">
                  {msgDate}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}
            <ChatBubble message={msg} projectById={projectById} profileById={profileById} organizationId={organizationId} />
          </div>
        );
      })}
    </>
  );
}

// ─── Single chat bubble ───────────────────────────────────────────────────────

function ChatBubble({
  message,
  projectById,
  profileById,
  organizationId,
}: {
  message: ChatMessage;
  projectById: Record<string, ProjectWithStages>;
  profileById: Record<string, UserProfile>;
  organizationId: Id<"organizations">;
}) {
  const [traceOpen, setTraceOpen] = useState(false);
  const isSystemEdit = message.lineUserId === "system:dashboard";
  const isBot = message.lineUserId === "system:bot";

  const relevantFields = message.extraction?.extractedFields.filter(
    (f) => f.confidence >= 0.7
  ) ?? [];

  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const projectName = message.projectId
    ? (projectById[message.projectId as string]?.name ?? null)
    : null;

  const profile = profileById[message.lineUserId];
  const displayName = profile?.displayName ?? (isSystemEdit || isBot ? null : `…${message.lineUserId.slice(-8)}`);

  // Dashboard field edits → green chip
  if (isSystemEdit) {
    const displayText = message.text.replace("[Dashboard] ", "");
    return (
      <div className="flex justify-center py-1.5 my-1">
        <div className="flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-2.5 py-0.5 text-xs max-w-[80%]">
          <IconPencil className="size-2.5 text-green-600 dark:text-green-400 shrink-0" />
          <span className="text-green-700 dark:text-green-300 text-center leading-snug">
            {projectName && <span className="font-medium">{projectName}: </span>}{displayText}
          </span>
        </div>
      </div>
    );
  }

  // Bot messages (dashboard push or AI clarification) → right-aligned blue bubble
  if (isBot) {
    const botLabel = message.sentByName ? `Bot (sent by ${message.sentByName})` : "Bot";
    return (
      <div className="flex items-start gap-2 py-0.5 justify-end group">
        <div className="flex flex-col items-end min-w-0 max-w-[75%]">
          <p className="text-[11px] text-muted-foreground font-medium mb-0.5">{botLabel}</p>
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

  const hasTrace = !!message.aiTraceId;

  return (
    <>
      <div className="flex items-start gap-2 py-0.5 group">
        {/* Avatar */}
        <div className={`size-7 rounded-full flex items-center justify-center shrink-0 overflow-hidden text-white text-xs font-bold mt-0.5 ${!profile?.pictureUrl ? getUserColor(message.lineUserId) : ""}`}>
          {profile?.pictureUrl ? (
            <img src={profile.pictureUrl} alt={displayName ?? ""} className="w-full h-full object-cover" />
          ) : (
            <IconUser className="size-3.5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Sender name */}
          {displayName && (
            <p className="text-[11px] text-muted-foreground font-medium mb-0.5 truncate">
              {displayName}
            </p>
          )}

          {/* Message bubble + AI trace icon */}
          <div className="flex items-end gap-2">
            <div className="max-w-[75%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm leading-relaxed">
              {message.imageUrl && message.messageType === "image" ? (
                <img
                  src={message.imageUrl}
                  alt="Image"
                  className="max-w-full rounded-lg max-h-64 object-cover"
                />
              ) : message.imageUrl && message.messageType === "video" ? (
                <video
                  src={message.imageUrl}
                  controls
                  className="max-w-full rounded-lg max-h-64"
                  preload="metadata"
                />
              ) : message.imageUrl && (message.messageType === "file" || message.messageType === "audio") ? (
                <a
                  href={message.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs underline underline-offset-2"
                >
                  {message.messageType === "audio" ? "🔊 Audio file" : "📎 " + (message.text || "File attachment")}
                </a>
              ) : message.messageType === "sticker" ? (
                <span className="text-muted-foreground italic text-xs">[Sticker]</span>
              ) : (
                message.text
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 mb-1">
              {hasTrace && (
                <button
                  onClick={() => setTraceOpen(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5 hover:bg-violet-100 dark:hover:bg-violet-900/40"
                  title="View AI decision trace"
                >
                  <IconSparkles className="size-3.5 text-violet-500" />
                </button>
              )}
              <span className="text-xs text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity">
                {time}
              </span>
            </div>
          </div>

          {/* Extracted field chips */}
          {relevantFields.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 ml-1 items-center">
              {projectName && (
                <span className="text-[10px] text-blue-500/70 dark:text-blue-400/70 font-medium shrink-0 mr-0.5">
                  {projectName}:
                </span>
              )}
              {relevantFields.map((f) => (
                <div
                  key={f.fieldKey}
                  className="flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-2 py-0.5 text-xs"
                >
                  <IconBrain className="size-2.5 text-blue-500 shrink-0" />
                  <span className="text-blue-700 dark:text-blue-300 font-medium">{f.fieldKey}</span>
                  <span className="text-blue-600 dark:text-blue-400">→ {f.value}</span>
                  <span className="text-blue-400 dark:text-blue-500">
                    {Math.round(f.confidence * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Knowledge Sources badge — shown when AI used RAG to answer */}
          {(message.intent === "product_query" || message.intent === "hybrid") &&
            message.processingStatus === "complete" && (
              <div className="flex flex-wrap gap-1 mt-1 ml-1">
                <div className="flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-xs">
                  <IconDatabase className="size-2.5 text-emerald-500 shrink-0" />
                  <span className="text-emerald-700 dark:text-emerald-300">From Knowledge Sources</span>
                </div>
              </div>
            )}
        </div>
      </div>

      {/* AI Trace Modal */}
      {hasTrace && (
        <AITraceModal
          open={traceOpen}
          onClose={() => setTraceOpen(false)}
          messageId={message._id}
          messageText={message.text}
          organizationId={organizationId}
        />
      )}
    </>
  );
}

// ─── AI Trace Modal ───────────────────────────────────────────────────────────

const STEP_META: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  intent_classification: {
    label: "Intent Classification",
    color: "text-violet-700 dark:text-violet-300",
    bgColor: "bg-violet-50 dark:bg-violet-950/40",
    borderColor: "border-violet-200 dark:border-violet-800",
  },
  project_routing: {
    label: "Project Routing",
    color: "text-blue-700 dark:text-blue-300",
    bgColor: "bg-blue-50 dark:bg-blue-950/40",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  rag: {
    label: "Knowledge Sources Query",
    color: "text-emerald-700 dark:text-emerald-300",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
    borderColor: "border-emerald-200 dark:border-emerald-800",
  },
  field_extraction: {
    label: "Field Extraction",
    color: "text-orange-700 dark:text-orange-300",
    bgColor: "bg-orange-50 dark:bg-orange-950/40",
    borderColor: "border-orange-200 dark:border-orange-800",
  },
  clarification_sent: {
    label: "Clarification Sent",
    color: "text-yellow-700 dark:text-yellow-300",
    bgColor: "bg-yellow-50 dark:bg-yellow-950/40",
    borderColor: "border-yellow-200 dark:border-yellow-800",
  },
  error: {
    label: "Error",
    color: "text-red-700 dark:text-red-300",
    bgColor: "bg-red-50 dark:bg-red-950/40",
    borderColor: "border-red-200 dark:border-red-800",
  },
};

function formatMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function StepCard({ step, index, total }: {
  step: { name: string; inputTokens: number; outputTokens: number; durationMs: number; status: string; details: string; prompt?: string };
  index: number;
  total: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = STEP_META[step.name] ?? {
    label: step.name,
    color: "text-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-border",
  };
  const isSkipped = step.status === "skipped";
  const isError = step.status === "error";

  let details: Record<string, unknown> = {};
  try { details = JSON.parse(step.details); } catch {}

  function renderDetailLine(key: string, val: unknown): string {
    if (typeof val === "number") return String(Math.round(val * 100) / 100);
    if (typeof val === "boolean") return val ? "yes" : "no";
    if (Array.isArray(val)) return `${val.length} item${val.length !== 1 ? "s" : ""}`;
    if (typeof val === "string") return val;
    return String(val);
  }

  const importantKeys: Record<string, string[]> = {
    intent_classification: ["intent", "confidence", "reasoning"],
    project_routing: ["projectName", "confidence", "implicit", "reasoning"],
    rag: ["chunksFound", "answerPreview"],
    field_extraction: ["stageName", "stageOrder", "isUpdate"],
  };
  const keysToShow = importantKeys[step.name] ?? Object.keys(details).slice(0, 4);

  return (
    <div className="relative">
      {/* Connector line */}
      {index < total - 1 && (
        <div className="absolute left-5 top-full w-px h-4 bg-border z-10" />
      )}

      <div className={`rounded-xl border ${meta.bgColor} ${meta.borderColor} overflow-hidden ${isSkipped ? "opacity-60" : ""}`}>
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
          onClick={() => setExpanded(!expanded)}
        >
          <div className={`size-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${isError ? "bg-red-500" : isSkipped ? "bg-muted-foreground" : "bg-primary"}`}>
            {index + 1}
          </div>
          <span className={`font-medium text-sm flex-1 ${meta.color}`}>{meta.label}</span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {!isSkipped && (
              <>
                <span title="Input tokens">↑ {step.inputTokens.toLocaleString()}</span>
                <span title="Output tokens">↓ {step.outputTokens.toLocaleString()}</span>
                <span>{formatMs(step.durationMs)}</span>
              </>
            )}
            {isSkipped && <span className="italic">auto-routed</span>}
            {isError && <IconAlertCircle className="size-4 text-red-500" />}
            {expanded ? <IconChevronDown className="size-3.5" /> : <IconChevronRight className="size-3.5" />}
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-inherit px-4 pb-3 pt-2 space-y-1.5">
            {/* Key summary rows */}
            {keysToShow.map((k) => details[k] !== undefined && (
              <div key={k} className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground font-medium w-28 shrink-0">{k}:</span>
                <span className="text-foreground break-words">{renderDetailLine(k, details[k])}</span>
              </div>
            ))}

            {/* Field extraction: list fields */}
            {step.name === "field_extraction" && Array.isArray((details as any).fields) && (details as any).fields.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Extracted fields</p>
                {((details as any).fields as Array<{ key: string; value: string; confidence: number }>).map((f) => (
                  <div key={f.key} className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-muted-foreground w-28 truncate shrink-0">{f.key}</span>
                    <span className="flex-1 truncate">{f.value}</span>
                    <span className="text-muted-foreground shrink-0">{Math.round(f.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
            )}

            {/* Prompt sent to AI */}
            {step.prompt && (
              <div className="mt-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Prompt sent to AI</p>
                <pre className="text-[10px] text-muted-foreground bg-muted/60 rounded-md p-2 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {step.prompt}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AITraceModal({
  open,
  onClose,
  messageId,
  messageText,
  organizationId,
}: {
  open: boolean;
  onClose: () => void;
  messageId: Id<"messages">;
  messageText: string;
  organizationId: Id<"organizations">;
}) {
  const trace = useQuery(
    api.aiTraces.getByMessageId,
    open ? { messageId, organizationId } : "skip"
  );

  const outcomeLabel: Record<string, string> = {
    stage_filled: "Stage filled",
    rag_answered: "Knowledge Sources answered",
    stage_filled_and_rag: "Stage filled + KS answered",
    clarification_sent: "Clarification sent",
    no_action: "No action",
    error: "Error",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconSparkles className="size-4 text-violet-500" />
            AI Decision Trace
          </DialogTitle>
        </DialogHeader>

        {/* Original message */}
        <div className="rounded-lg border bg-muted/30 px-3.5 py-2.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Message</p>
          <p className="text-sm text-foreground leading-relaxed">{messageText}</p>
        </div>

        {trace === undefined ? (
          <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
            <IconLoader2 className="size-5 animate-spin" />
            <span>Loading trace…</span>
          </div>
        ) : trace === null ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No trace recorded for this message.
          </div>
        ) : (
          <>
            {/* Token summary bar */}
            <div className="grid grid-cols-5 gap-3">
              <div className="rounded-lg border bg-background p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Input tokens</p>
                <p className="text-xl font-bold text-foreground">{trace.totalInputTokens.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border bg-background p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Output tokens</p>
                <p className="text-xl font-bold text-foreground">{trace.totalOutputTokens.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border bg-background p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Total time</p>
                <p className="text-xl font-bold text-foreground">{formatMs(trace.totalDurationMs)}</p>
              </div>
              <div className="rounded-lg border bg-background p-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Outcome</p>
                <p className="text-sm font-semibold text-foreground">{outcomeLabel[trace.outcome] ?? trace.outcome}</p>
              </div>
              <div className="rounded-lg border bg-amber-500/10 border-amber-500/20 p-3 text-center">
                <p className="text-[10px] text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">Credits used</p>
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">1</p>
              </div>
            </div>

            {/* Steps flowchart */}
            <div className="space-y-4 mt-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Decision flow</p>
              <div className="space-y-4">
                {trace.steps.map((step, i) => (
                  <StepCard key={i} step={step} index={i} total={trace.steps.length} />
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Project card in right panel ─────────────────────────────────────────────

function ProjectCard({
  project,
  orgSlug,
  orgId,
  groupChatId,
  defaultOpen,
}: {
  project: ProjectWithStages;
  orgSlug: string;
  orgId: Id<"organizations">;
  groupChatId: Id<"groupChats">;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<"stages" | "roles" | "reminders">("stages");
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  const pauseProject = useMutation(api.projects.pause);
  const resumeProject = useMutation(api.projects.resume);
  const completeProject = useMutation(api.projects.complete);

  const totalStages = project.stageStates.length;
  const doneStages = project.stageStates.filter(
    (s) => s.status === "completed" || s.status === "skipped"
  ).length;
  const progressPct = totalStages > 0 ? Math.round((doneStages / totalStages) * 100) : 0;
  const activeStage = project.stageStates.find((s) => s.status === "active");

  async function handlePause() {
    const ok = await confirmDialog({
      title: `Pause "${project.name}"?`,
      description: "The AI will stop processing messages for this project. All reminders will be cancelled. You can resume it later.",
      confirmLabel: "Pause project",
      variant: "default",
    });
    if (!ok) return;
    try {
      await pauseProject({ projectId: project._id, organizationId: orgId });
      toast.success("Project paused");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to pause");
    }
  }

  async function handleResume() {
    const ok = await confirmDialog({
      title: `Resume "${project.name}"?`,
      description: "The AI will resume processing messages for this project and reminders will be rescheduled.",
      confirmLabel: "Resume project",
      variant: "default",
    });
    if (!ok) return;
    try {
      await resumeProject({ projectId: project._id, organizationId: orgId });
      toast.success("Project resumed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resume");
    }
  }

  async function handleComplete() {
    const ok = await confirmDialog({
      title: `Mark "${project.name}" as complete?`,
      description: "This project will be marked as done. The AI will no longer process messages for it and all reminders will be cancelled.",
      confirmLabel: "Mark complete",
      variant: "default",
    });
    if (!ok) return;
    try {
      await completeProject({ projectId: project._id, organizationId: orgId });
      toast.success("Project marked complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete");
    }
  }

  return (
    <div className="rounded-xl border overflow-hidden">
      {ConfirmDialogNode}

      {/* Card header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={() => setOpen(!open)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-sm truncate">{project.name}</p>
            <ProjectStatusBadge status={project.status} />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  project.status === "completed" ? "bg-green-500" : project.status === "paused" ? "bg-yellow-500" : "bg-primary"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {doneStages}/{totalStages}
            </span>
          </div>

          {activeStage?.template && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Stage {activeStage.stageOrder}: {activeStage.template.name}
            </p>
          )}
        </button>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          {project.status === "active" && (
            <>
              <button
                title="Pause project"
                onClick={handlePause}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-yellow-600 transition-colors"
              >
                <IconPlayerPause className="size-3.5" />
              </button>
              <button
                title="Mark complete"
                onClick={handleComplete}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-green-600 transition-colors"
              >
                <IconSquareCheck className="size-3.5" />
              </button>
            </>
          )}
          {project.status === "paused" && (
            <>
              <button
                title="Resume project"
                onClick={handleResume}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
              >
                <IconPlayerPlay className="size-3.5" />
              </button>
              <button
                title="Mark complete"
                onClick={handleComplete}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-green-600 transition-colors"
              >
                <IconSquareCheck className="size-3.5" />
              </button>
            </>
          )}
          <button
            onClick={() => setOpen(!open)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
          >
            <IconChevronDown
              className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {open && (
        <div className="border-t">
          {/* Tab bar */}
          <div className="flex border-b bg-muted/20">
            <button
              onClick={() => setTab("stages")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                tab === "stages"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <IconLayoutList className="size-3.5" />
              Stages
            </button>
            <button
              onClick={() => setTab("roles")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                tab === "roles"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <IconUsers className="size-3.5" />
              Roles
            </button>
            <button
              onClick={() => setTab("reminders")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                tab === "reminders"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <IconBell className="size-3.5" />
              Reminders
            </button>
          </div>

          {tab === "stages" && (
            <>
              {project.stageStates.map((stage, i) => (
                <div key={stage._id}>
                  {i > 0 && <Separator />}
                  <StageRow stage={stage} orgId={orgId} projectId={project._id} />
                </div>
              ))}
            </>
          )}

          {tab === "roles" && (
            <RolesTab
              projectId={project._id}
              templateId={project.workflowTemplateId}
              groupChatId={groupChatId}
              orgId={orgId}
            />
          )}

          {tab === "reminders" && (
            <RemindersTab
              projectId={project._id}
              orgId={orgId}
              stageStates={project.stageStates}
              templateId={project.workflowTemplateId}
              groupChatId={groupChatId}
            />
          )}

          <div className="px-3 py-2 border-t bg-muted/20">
            <Link
              href={`/dashboard/${orgSlug}/projects/${project._id}`}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Open full project view →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Roles tab ───────────────────────────────────────────────────────────────

function RolesTab({
  projectId,
  templateId,
  groupChatId,
  orgId,
}: {
  projectId: Id<"projects">;
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
  const fetchMembers = useAction(api.userLineProfiles.fetchAllGroupMembers);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [activeTeam, setActiveTeam] = useState<string | null>(null);

  // Load existing assignments into drafts when data arrives
  useEffect(() => {
    if (!context) return;
    const initial: Record<string, string> = {};
    for (const role of context.roles) {
      initial[role.roleId] = role.assignedLineUserId ?? "";
    }
    setDrafts(initial);
  }, [context?.roles.length]);

  // Set default active team when context loads
  useEffect(() => {
    if (!context || context.roles.length === 0) return;
    const teams = [...new Set(context.roles.map((r) => r.teamName ?? "Unassigned"))];
    if (activeTeam === null && teams.length > 0) setActiveTeam(teams[0]);
  }, [context, activeTeam]);

  async function handleFetch() {
    setFetching(true);
    try {
      await fetchMembers({ groupChatId, organizationId: orgId });
    } catch {
      // ignore
    } finally {
      setFetching(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const mappings = Object.entries(drafts)
        .filter(([, v]) => v.trim())
        .map(([roleId, lineUserId]) => ({
          roleId: roleId as Id<"roles">,
          lineUserId: lineUserId.trim(),
        }));
      await upsertMappings({ organizationId: orgId, groupChatId, mappings });
      toast.success("Role assignments saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!context) {
    return (
      <div className="flex items-center justify-center py-8">
        <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (context.roles.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-muted-foreground">
        No roles defined in this template.
      </div>
    );
  }

  const teams = [...new Set(context.roles.map((r) => r.teamName ?? "Unassigned"))];
  const currentTeam = activeTeam ?? teams[0];
  const visibleRoles = context.roles.filter((r) => (r.teamName ?? "Unassigned") === currentTeam);

  const isDirty = context.roles.some(
    (r) => (drafts[r.roleId] ?? "") !== (r.assignedLineUserId ?? "")
  );

  return (
    <div>
      {/* Team sub-tabs */}
      {teams.length > 1 && (
        <div className="flex gap-0.5 px-3 pt-2.5 overflow-x-auto">
          {teams.map((team) => (
            <button
              key={team}
              onClick={() => setActiveTeam(team)}
              className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                currentTeam === team
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {team}
            </button>
          ))}
        </div>
      )}

      <div className="px-3 py-3 space-y-3">
        {/* Fetch members banner */}
        {context.knownUsers.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground">
            <IconUsers className="size-3.5 shrink-0" />
            <span className="flex-1">No members fetched yet.</span>
            <button
              onClick={handleFetch}
              disabled={fetching}
              className="text-primary hover:underline font-medium shrink-0"
            >
              {fetching ? "Fetching…" : "Fetch now"}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{context.knownUsers.length} members loaded</span>
            <button
              onClick={handleFetch}
              disabled={fetching}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <IconLoader2 className={`size-3 ${fetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        )}

        {/* Role rows for the active team */}
        {visibleRoles.map((role) => {
          const assigned = drafts[role.roleId] ?? "";
          return (
            <div key={role.roleId} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{role.roleName}</p>
              </div>
              <select
                value={assigned}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [role.roleId]: e.target.value }))}
                className="h-7 text-xs rounded-md border border-input bg-background px-2 pr-6 min-w-[120px] max-w-[160px] truncate focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— unassigned —</option>
                {context.knownUsers.map((u) => (
                  <option key={u.lineUserId} value={u.lineUserId}>
                    {u.displayName}
                  </option>
                ))}
              </select>
            </div>
          );
        })}

        {isDirty && (
          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              className="h-6 text-xs px-2.5"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <IconLoader2 className="size-3 animate-spin" /> : "Save"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reminders tab ───────────────────────────────────────────────────────────

const CANCEL_REASON_LABELS: Record<string, string> = {
  stage_advanced:     "Stage was completed",
  field_filled:       "Field was filled",
  project_paused:     "Project was paused",
  project_completed:  "Project was completed",
  project_resumed:    "Project was resumed",
  stage_skipped:      "Stage was skipped",
  manual:             "Manually cancelled",
};

function RemindersTab({
  projectId,
  orgId,
  stageStates,
  templateId,
  groupChatId,
}: {
  projectId: Id<"projects">;
  orgId: Id<"organizations">;
  stageStates: StageWithTemplate[];
  templateId: Id<"workflowTemplates">;
  groupChatId: Id<"groupChats">;
}) {
  const reminders = useQuery(api.reminders.listByProject, { projectId, organizationId: orgId });
  const rolesCtx = useQuery(api.groupChatRoleMappings.getProjectCreationContext, {
    templateId, groupChatId, organizationId: orgId,
  });
  const cancelManually = useMutation(api.reminders.cancelManually);
  const scheduleManual = useMutation(api.reminders.scheduleManual);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Add form state
  const [formRoleIds, setFormRoleIds] = useState<string[]>([]);
  const [formMessage, setFormMessage] = useState("");
  const [formDateTime, setFormDateTime] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  const activeStageState = stageStates.find((s) => s.status === "active") ?? stageStates[0];

  const roleNameById = Object.fromEntries(
    (rolesCtx?.roles ?? []).map((r) => [r.roleId, r.roleName])
  );
  type RoleEntry = NonNullable<typeof rolesCtx>["roles"][number];
  const rolesByTeam = (rolesCtx?.roles ?? []).reduce<Record<string, RoleEntry[]>>((acc, r) => {
    const team = r.teamName ?? "Unassigned";
    if (!acc[team]) acc[team] = [];
    acc[team].push(r);
    return acc;
  }, {});

  const stageNameById = Object.fromEntries(
    stageStates.map((s) => [s._id as string, s.template?.name ?? `Stage ${s.stageOrder}`])
  );

  function formatTime(ts: number) {
    return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  async function handleCancel(reminderId: string) {
    try {
      await cancelManually({ reminderId: reminderId as Id<"reminders">, organizationId: orgId });
      toast.success("Reminder cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setCancellingId(null);
    }
  }

  async function handleAddReminder() {
    if (!formMessage.trim() || !formDateTime || !activeStageState) return;
    setFormSaving(true);
    try {
      const scheduledFor = new Date(formDateTime).getTime();
      if (isNaN(scheduledFor) || scheduledFor <= Date.now()) {
        toast.error("Please pick a future date and time");
        return;
      }
      await scheduleManual({
        projectId,
        organizationId: orgId,
        stageStateId: activeStageState._id,
        groupChatId,
        roleIds: formRoleIds as Id<"roles">[],
        message: formMessage.trim(),
        scheduledFor,
      });
      toast.success("Reminder scheduled");
      setShowAdd(false);
      setFormRoleIds([]);
      setFormMessage("");
      setFormDateTime("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to schedule");
    } finally {
      setFormSaving(false);
    }
  }

  if (reminders === undefined) {
    return (
      <div className="flex items-center justify-center py-8">
        <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  type Reminder = NonNullable<typeof reminders>[number];

  function ReminderRow({ r }: { r: Reminder }) {
    const stageName = stageNameById[r.stageStateId as string];
    const isCancelled = r.status === "cancelled";
    const isSent = r.status === "sent";
    const isFailed = r.status === "failed";
    const isScheduled = r.status === "scheduled";
    const isExpanded = expandedId === r._id;
    const reason = r.cancelReason ? (CANCEL_REASON_LABELS[r.cancelReason] ?? r.cancelReason) : null;
    const roles = (r.roleIds as string[] | undefined)?.map((id) => roleNameById[id] ?? id) ?? [];

    return (
      <div className={`py-2 ${isCancelled ? "opacity-60" : ""}`}>
        <div
          className="flex items-start gap-2.5 cursor-pointer group"
          onClick={() => setExpandedId(isExpanded ? null : r._id)}
        >
          <div className="shrink-0 mt-0.5">
            {isScheduled && <IconClock className="size-3.5 text-blue-500" />}
            {isSent && <IconCheck className="size-3.5 text-green-500" />}
            {isCancelled && <IconX className="size-3.5 text-muted-foreground" />}
            {isFailed && <IconAlertCircle className="size-3.5 text-red-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {stageName && <span className="text-xs font-medium truncate">{stageName}</span>}
              {r.fieldLabel && <span className="text-[10px] text-muted-foreground">· {r.fieldLabel}</span>}
              <span className={`text-[10px] px-1.5 py-0 rounded-full font-medium ${
                isScheduled ? "bg-blue-500/10 text-blue-700 dark:text-blue-300" :
                isSent      ? "bg-green-500/10 text-green-700 dark:text-green-300" :
                isCancelled ? "bg-muted text-muted-foreground" :
                              "bg-red-500/10 text-red-600"
              }`}>
                {isScheduled ? "Scheduled" : isSent ? "Sent" : isCancelled ? "Cancelled" : "Failed"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isScheduled ? `Fires ${formatTime(r.scheduledFor)}`
                : isSent && r.sentAt ? `Sent ${formatTime(r.sentAt)}`
                : isCancelled && r.cancelledAt ? `Cancelled ${formatTime(r.cancelledAt)}`
                : formatTime(r.scheduledFor)}
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-1">
            {isScheduled && (
              <button
                onClick={(e) => { e.stopPropagation(); setCancellingId(r._id); }}
                className="p-0.5 rounded text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Cancel reminder"
              >
                <IconTrash className="size-3" />
              </button>
            )}
            <IconChevronRight className={`size-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="ml-6 mt-2 space-y-1.5 text-[11px] text-muted-foreground bg-muted/40 rounded-md p-2">
            {r.reminderMessage && (
              <div>
                <span className="font-medium text-foreground">Message</span>
                <p className="mt-0.5 whitespace-pre-wrap">{r.reminderMessage}</p>
              </div>
            )}
            {roles.length > 0 && (
              <div>
                <span className="font-medium text-foreground">Recipients</span>
                <p className="mt-0.5">{roles.join(", ")}</p>
              </div>
            )}
            <div>
              <span className="font-medium text-foreground">Scheduled for</span>
              <p className="mt-0.5">{formatTime(r.scheduledFor)}</p>
            </div>
            {isCancelled && reason && (
              <div>
                <span className="font-medium text-foreground">Cancel reason</span>
                <p className="mt-0.5">{reason}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const scheduled = reminders.filter((r) => r.status === "scheduled");
  const past = reminders.filter((r) => r.status !== "scheduled");

  return (
    <div>
      {/* Header with + button */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Reminders</p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <IconPlus className="size-3" /> Add
        </button>
      </div>

      {reminders.length === 0 && !showAdd && (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          <IconBell className="size-6 mx-auto mb-2 opacity-30" />
          No reminders for this project yet.
        </div>
      )}

      <div className="px-3 divide-y">
        {scheduled.length > 0 && (
          <div className="pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Upcoming</p>
            {scheduled.map((r) => <ReminderRow key={r._id} r={r} />)}
          </div>
        )}
        {past.length > 0 && (
          <div className={`${scheduled.length > 0 ? "pt-2" : ""}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">History</p>
            {past.map((r) => <ReminderRow key={r._id} r={r} />)}
          </div>
        )}
      </div>

      {/* Cancel confirm dialog */}
      <Dialog open={!!cancellingId} onOpenChange={(o) => { if (!o) setCancellingId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel this reminder?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">The reminder will not be sent and cannot be undone.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setCancellingId(null)}>Keep</Button>
            <Button variant="destructive" size="sm" onClick={() => cancellingId && handleCancel(cancellingId)}>
              Cancel reminder
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add reminder dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) setShowAdd(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Schedule a reminder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Role selector */}
            <div>
              <Label className="text-xs mb-1 block">Notify roles</Label>
              <div className="space-y-1 max-h-40 overflow-y-auto border rounded-md p-2">
                {Object.entries(rolesByTeam).map(([team, roles]) => (
                  <div key={team}>
                    {Object.keys(rolesByTeam).length > 1 && (
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{team}</p>
                    )}
                    {roles?.map((role) => (
                      <label key={role.roleId} className="flex items-center gap-2 py-0.5 cursor-pointer">
                        <input
                          type="checkbox"
                          className="size-3 accent-primary"
                          checked={formRoleIds.includes(role.roleId)}
                          onChange={(e) => {
                            setFormRoleIds(prev =>
                              e.target.checked ? [...prev, role.roleId] : prev.filter(id => id !== role.roleId)
                            );
                          }}
                        />
                        <span className="text-xs">{role.roleName}</span>
                      </label>
                    ))}
                  </div>
                ))}
                {Object.keys(rolesByTeam).length === 0 && (
                  <p className="text-xs text-muted-foreground py-1">No roles defined for this template</p>
                )}
              </div>
            </div>

            {/* Message */}
            <div>
              <Label className="text-xs mb-1 block">Message</Label>
              <Textarea
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                placeholder="Reminder message to send..."
                className="text-sm resize-none"
                rows={3}
              />
            </div>

            {/* Date/time */}
            <div>
              <Label className="text-xs mb-1 block">Send at</Label>
              <Input
                type="datetime-local"
                value={formDateTime}
                onChange={(e) => setFormDateTime(e.target.value)}
                min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                className="text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!formMessage.trim() || !formDateTime || formSaving}
              onClick={handleAddReminder}
            >
              {formSaving ? <IconLoader2 className="size-3 animate-spin" /> : "Schedule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Stage row inside project card ───────────────────────────────────────────

function StageRow({
  stage,
  orgId,
  projectId,
}: {
  stage: StageWithTemplate;
  orgId: Id<"organizations">;
  projectId: Id<"projects">;
}) {
  const template = stage.template;
  const collected = (stage.collectedFields ?? {}) as Record<string, CollectedField>;
  const isActive = stage.status === "active";

  const requiredFields = template?.requiredFields ?? [];
  const filledCount = requiredFields.filter((f) => f.key in collected).length;

  const advanceStage = useMutation(api.projects.advanceStage);
  const skipStage = useMutation(api.projects.skipStage);

  async function handleAdvance() {
    try {
      const result = await advanceStage({ projectId, organizationId: orgId });
      if ((result as { completed?: boolean }).completed) toast.success("Project completed!");
      else toast.success(`Advanced to next stage`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to advance");
    }
  }

  async function handleSkip() {
    try {
      await skipStage({ projectId, organizationId: orgId });
      toast.success("Stage skipped");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to skip");
    }
  }

  return (
    <div className={`px-3 py-2.5 ${isActive ? "bg-primary/5" : ""}`}>
      {/* Stage header */}
      <div className="flex items-center gap-2 mb-2">
        <StageStatusIcon status={stage.status} />
        <p className={`text-xs font-semibold flex-1 truncate ${isActive ? "text-primary" : "text-foreground"}`}>
          {template?.name ?? `Stage ${stage.stageOrder}`}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {requiredFields.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {filledCount}/{requiredFields.length}
            </span>
          )}
          {isActive && (
            <>
              <button
                onClick={handleSkip}
                title="Skip stage"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <IconPlayerSkipForward className="size-3.5" />
              </button>
              <button
                onClick={handleAdvance}
                title="Complete & advance"
                className="text-green-500 hover:text-green-600 transition-colors"
              >
                <IconCircleCheck className="size-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Fields — always shown for all stage statuses */}
      {requiredFields.length > 0 ? (
        <div className="flex flex-col gap-1 pl-5">
          {requiredFields.map((field) => {
            const fieldData = collected[field.key];
            return (
              <FieldRow
                key={field.key}
                field={field}
                fieldData={fieldData}
                stageStateId={stage._id}
                orgId={orgId}
                isActive={isActive}
              />
            );
          })}
        </div>
      ) : (
        stage.status === "pending" && (
          <p className="text-xs text-muted-foreground/40 pl-5 italic">No required fields</p>
        )
      )}
    </div>
  );
}

// ─── Inline field row with edit capability ────────────────────────────────────

function FieldRow({
  field,
  fieldData,
  stageStateId,
  orgId,
  isActive,
}: {
  field: { key: string; label: string; isRequired: boolean };
  fieldData?: CollectedField;
  stageStateId: Id<"projectStageStates">;
  orgId: Id<"organizations">;
  isActive: boolean;
}) {
  const updateField = useMutation(api.projectStageStates.updateField);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const isFilled = !!fieldData;
  const isAi = isFilled && fieldData.confidence < 1.0;

  async function handleSave() {
    if (!draft.trim()) { setEditing(false); return; }
    setSaving(true);
    try {
      await updateField({
        organizationId: orgId,
        stageStateId,
        fieldKey: field.key,
        value: draft.trim(),
        fieldLabel: field.label,
      });
      setEditing(false);
      toast.success(`${field.label} updated`);
    } catch {
      toast.error("Failed to update field");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 text-xs min-w-0">
        <Input
          className="h-6 text-xs flex-1 min-w-0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
          disabled={saving}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-green-500 hover:text-green-600 shrink-0"
        >
          {saving ? <IconLoader2 className="size-3 animate-spin" /> : <IconCheck className="size-3" />}
        </button>
        <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground shrink-0">
          <IconX className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-1.5 text-xs min-w-0 group/field">
      {isFilled ? (
        <IconCheck className="size-3 text-green-500 shrink-0 mt-px" />
      ) : (
        <IconCircle className="size-3 text-muted-foreground/30 shrink-0 mt-px" />
      )}
      <span className="text-muted-foreground shrink-0 min-w-[64px] truncate">
        {field.label}
      </span>
      {isFilled ? (
        <span className="font-medium truncate flex-1">{String(fieldData.value)}</span>
      ) : (
        <span className="text-muted-foreground/40 italic flex-1">—</span>
      )}
      {isAi && (
        <span className="text-blue-500 shrink-0 flex items-center gap-0.5">
          <IconBrain className="size-2.5" />
          {Math.round(fieldData.confidence * 100)}%
        </span>
      )}
      {(isFilled || isActive) && (
        <button
          className="shrink-0 opacity-0 group-hover/field:opacity-100 transition-opacity text-muted-foreground hover:text-foreground ml-auto"
          onClick={() => { setDraft(isFilled ? String(fieldData.value) : ""); setEditing(true); }}
          title={`Edit ${field.label}`}
        >
          <IconPencil className="size-3" />
        </button>
      )}
    </div>
  );
}

// ─── Compose bar ─────────────────────────────────────────────────────────────

function ComposeBar({
  groupChatId,
  organizationId,
  isActive = true,
}: {
  groupChatId: Id<"groupChats">;
  organizationId: Id<"organizations">;
  orgSlug: string;
  isActive?: boolean;
}) {
  const { user } = useUser();
  const generateUploadUrl = useMutation(api.fileStorage.generateUploadUrl);
  const sendMessage = useAction(api.groupChats.sendMessage);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  // Close emoji picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    }
    if (showEmoji) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showEmoji]);

  async function handleSend() {
    if ((!text.trim() && !pendingImage) || sending) return;
    setSending(true);
    try {
      let storageId: Id<"_storage"> | undefined;

      if (pendingImage) {
        const uploadUrl = await generateUploadUrl({ organizationId });
        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          body: pendingImage.file,
          headers: { "Content-Type": pendingImage.file.type },
        });
        if (!uploadRes.ok) throw new Error("Upload failed");
        const { storageId: sid } = await uploadRes.json();
        storageId = sid as Id<"_storage">;
      }

      const sentByName = user?.firstName
        ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
        : (user?.emailAddresses?.[0]?.emailAddress ?? undefined);

      await sendMessage({
        organizationId,
        groupChatId,
        text: text.trim() || undefined,
        storageId,
        sentByName,
      });

      setText("");
      setPendingImage(null);
      toast.success("Message sent to LINE group");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
    e.target.value = "";
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  if (!isActive) {
    return (
      <div className="shrink-0 border-t bg-muted/30 px-4 py-3 flex items-center gap-3 text-sm text-muted-foreground">
        <div className="flex items-center justify-center size-8 rounded-full bg-destructive/10 shrink-0">
          <IconDoorExit className="size-4 text-destructive" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-foreground text-sm">Bot has left this group</p>
          <p className="text-xs text-muted-foreground">This chat is archived — no new messages will be received or sent.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t bg-background relative">
      {/* Image preview */}
      {pendingImage && (
        <div className="flex items-center gap-2 px-4 pt-3">
          <div className="relative inline-block">
            <img
              src={pendingImage.previewUrl}
              alt="attachment"
              className="h-16 w-16 object-cover rounded-lg border"
            />
            <button
              onClick={() => setPendingImage(null)}
              className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-muted border flex items-center justify-center hover:bg-destructive hover:text-white transition-colors"
            >
              <IconX className="size-2.5" />
            </button>
          </div>
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
            {pendingImage.file.name}
          </span>
        </div>
      )}

      {/* Emoji picker — floats above the bar */}
      {showEmoji && (
        <div
          ref={emojiRef}
          className="absolute bottom-full left-4 mb-2 z-50 shadow-2xl rounded-xl overflow-hidden border"
        >
          <EmojiPicker
            onEmojiClick={(emojiData) => {
              setText((prev) => prev + emojiData.emoji);
              textareaRef.current?.focus();
            }}
            height={350}
            width={320}
            searchPlaceholder="Search emoji…"
          />
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 px-3 py-3">
        {/* Emoji toggle */}
        <button
          type="button"
          onClick={() => setShowEmoji((v) => !v)}
          className={`shrink-0 p-1.5 rounded-lg transition-colors ${showEmoji ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          title="Emoji"
        >
          <IconMoodSmile className="size-5" />
        </button>

        {/* Image attach */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`shrink-0 p-1.5 rounded-lg transition-colors ${pendingImage ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          title="Attach image"
        >
          <IconPhoto className="size-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Text area */}
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send as bot… (Enter to send, Shift+Enter for new line)"
          className="flex-1 min-h-[38px] max-h-[120px] resize-none text-sm py-2 leading-snug"
          rows={1}
          disabled={sending}
        />

        {/* Send */}
        <Button
          size="icon"
          className="shrink-0 size-9"
          onClick={handleSend}
          disabled={sending || (!text.trim() && !pendingImage)}
          title="Send (Enter)"
        >
          {sending ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconSend className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StageStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <IconCheck className="size-3.5 text-green-500 shrink-0" />;
  if (status === "active") return <div className="size-3.5 rounded-full bg-primary shrink-0" />;
  if (status === "skipped") return <IconMinus className="size-3.5 text-muted-foreground shrink-0" />;
  return <IconCircle className="size-3.5 text-muted-foreground/30 shrink-0" />;
}

function ProjectStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-0" },
    completed: { label: "Done", className: "bg-green-500/15 text-green-700 dark:text-green-300 border-0" },
    paused: { label: "Paused", className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-0" },
  };
  const cfg = map[status] ?? { label: status, className: "" };
  return <Badge className={`text-xs py-0 h-4 shrink-0 ${cfg.className}`}>{cfg.label}</Badge>;
}

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

// ─── Add project modal (group is pre-fixed) ───────────────────────────────────

function AddProjectModal({
  open,
  onClose,
  orgId,
  orgSlug,
  groupChatId,
  groupName,
  templates,
}: {
  open: boolean;
  onClose: () => void;
  orgId: Id<"organizations">;
  orgSlug: string;
  groupChatId: Id<"groupChats">;
  groupName: string;
  templates: Array<{ _id: Id<"workflowTemplates">; name: string }>;
}) {
  const createProject = useMutation(api.projects.create);
  const upsertRoleMappings = useMutation(api.groupChatRoleMappings.upsertMany);
  const refreshProfiles = useAction(api.userLineProfiles.refreshGroupProfiles);

  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string>(templates[0]?._id ?? "");
  const [roleMappings, setRoleMappings] = useState<Array<{ roleId: string; lineUserId: string }>>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      refreshProfiles({ groupChatId, organizationId: orgId }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const context = useQuery(
    api.groupChatRoleMappings.getProjectCreationContext,
    templateId
      ? { templateId: templateId as Id<"workflowTemplates">, groupChatId, organizationId: orgId }
      : "skip"
  );

  function handleClose() {
    setStep(1);
    setName("");
    setTemplateId(templates[0]?._id ?? "");
    setRoleMappings([]);
    setCreating(false);
    onClose();
  }

  function handleNext(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !templateId) return;
    if (!context || context.roles.length === 0) {
      void doCreate([]);
      return;
    }
    setRoleMappings(
      context.roles.map((r) => ({ roleId: r.roleId, lineUserId: r.assignedLineUserId ?? "" }))
    );
    setStep(2);
  }

  async function doCreate(overrideMappings?: Array<{ roleId: string; lineUserId: string }>) {
    const mappingsToSave = overrideMappings ?? roleMappings;
    setCreating(true);
    try {
      const valid = mappingsToSave
        .filter((m) => m.lineUserId.trim())
        .map((m) => ({ roleId: m.roleId as Id<"roles">, lineUserId: m.lineUserId.trim() }));
      if (valid.length > 0) {
        await upsertRoleMappings({ organizationId: orgId, groupChatId, mappings: valid });
      }
      await createProject({
        organizationId: orgId,
        groupChatId,
        workflowTemplateId: templateId as Id<"workflowTemplates">,
        name: name.trim(),
      });
      toast.success(`Project "${name.trim()}" created`);
      handleClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
      setCreating(false);
    }
  }

  const hasRoles = (context?.roles.length ?? 0) > 0;
  const contextLoading = context === undefined && !!templateId;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            New project
            {hasRoles && step === 2 && (
              <span className="text-xs font-normal text-muted-foreground">Step 2 of 2</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <form onSubmit={handleNext} className="flex flex-col gap-4 pt-2 overflow-y-auto">
            <div className="flex flex-col gap-1.5">
              <Label>Project name</Label>
              <Input
                placeholder="e.g. Solar Install – Building A"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={creating}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Group chat</Label>
              <Input value={groupName} disabled className="bg-muted text-muted-foreground" />
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
            <div className="flex justify-end gap-2 pt-1 pb-1">
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={creating || !name.trim() || contextLoading}>
                {contextLoading ? "Loading…" : hasRoles ? "Next →" : creating ? "Creating…" : "Create project"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col min-h-0 flex-1 gap-4 pt-2 overflow-hidden">
            <div className="shrink-0">
              <p className="text-sm font-medium">Assign team members to roles</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Map LINE group members to the roles used in this workflow. You can change this later.
              </p>
            </div>

            {/* Scrollable role list */}
            <div className="flex flex-col gap-3 overflow-y-auto flex-1 min-h-0 pr-1">
              {context?.roles.map((role, i) => (
                <div key={role.roleId} className="rounded-lg border p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{role.roleName}</p>
                    {role.teamName && (
                      <p className="text-xs text-muted-foreground">{role.teamName}</p>
                    )}
                  </div>
                  <Select
                    value={roleMappings[i]?.lineUserId ?? ""}
                    onValueChange={(v) =>
                      setRoleMappings((prev) => {
                        const next = [...prev];
                        next[i] = { roleId: role.roleId, lineUserId: v };
                        return next;
                      })
                    }
                  >
                    <SelectTrigger className="h-8 text-sm w-40 shrink-0">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      {(context?.knownUsers ?? []).map((u) => (
                        <SelectItem key={u.lineUserId} value={u.lineUserId}>
                          {u.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Footer — always visible */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t shrink-0">
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)} disabled={creating}>
                ← Back
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => void doCreate([])} disabled={creating}>
                  Skip
                </Button>
                <Button type="button" onClick={() => void doCreate()} disabled={creating}>
                  {creating ? "Creating…" : "Create project"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailSkeleton() {
  return (
    <div className="-my-4 md:-my-6 flex flex-col" style={{ height: "calc(100dvh - 48px)" }}>
      <div className="h-14 border-b flex items-center gap-3 px-4">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 border-r p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="size-7 rounded-full shrink-0" />
              <Skeleton className={`h-10 rounded-2xl ${i % 3 === 0 ? "w-3/4" : i % 2 === 0 ? "w-1/2" : "w-2/3"}`} />
            </div>
          ))}
        </div>
        <div className="w-[400px] p-4 space-y-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

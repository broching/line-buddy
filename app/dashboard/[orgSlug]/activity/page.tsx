"use client";

import { use, useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PaywallGate } from "@/components/billing/paywall-gate";
import {
  IconActivity,
  IconArchive,
  IconArrowMoveRight,
  IconCircleCheck,
  IconChevronsRight,
  IconFolderPlus,
  IconHistory,
  IconLoader2,
  IconRobot,
  IconSearch,
  IconSettings,
  IconShield,
  IconUserMinus,
  IconUserPlus,
  IconX,
} from "@tabler/icons-react";

// ─── Event type registry ──────────────────────────────────────────────────────

type EventConfig = {
  icon: React.ComponentType<{ className?: string }>;
  bgClass: string;
  iconClass: string;
  label: (log: LogEntry) => string;
};

const EVENT_CONFIG: Record<string, EventConfig> = {
  "project.created": {
    icon: IconFolderPlus,
    bgClass: "bg-blue-50 dark:bg-blue-950/40",
    iconClass: "text-blue-600 dark:text-blue-400",
    label: (l) => `Created project "${l.payload?.name ?? l.entityId}"`,
  },
  "project.completed": {
    icon: IconCircleCheck,
    bgClass: "bg-green-50 dark:bg-green-950/40",
    iconClass: "text-green-600 dark:text-green-400",
    label: (l) => `Completed project "${l.payload?.projectName ?? l.entityId}"`,
  },
  "project.stageAdvanced": {
    icon: IconArrowMoveRight,
    bgClass: "bg-primary/10",
    iconClass: "text-primary",
    label: (l) =>
      `Advanced to stage ${l.payload?.toStageOrder ?? ""}${l.payload?.toStageName ? `: ${l.payload.toStageName}` : ""}`,
  },
  "project.stageSkipped": {
    icon: IconChevronsRight,
    bgClass: "bg-amber-50 dark:bg-amber-950/40",
    iconClass: "text-amber-600 dark:text-amber-400",
    label: (l) => `Skipped stage ${l.payload?.skippedOrder ?? ""}`,
  },
  "project.archived": {
    icon: IconArchive,
    bgClass: "bg-muted",
    iconClass: "text-muted-foreground",
    label: () => "Archived a project",
  },
  "organization.lineCredentialsUpdated": {
    icon: IconSettings,
    bgClass: "bg-violet-50 dark:bg-violet-950/40",
    iconClass: "text-violet-600 dark:text-violet-400",
    label: () => "Updated LINE channel credentials",
  },
  "membership.added": {
    icon: IconUserPlus,
    bgClass: "bg-teal-50 dark:bg-teal-950/40",
    iconClass: "text-teal-600 dark:text-teal-400",
    label: () => "Added a team member",
  },
  "membership.removed": {
    icon: IconUserMinus,
    bgClass: "bg-red-50 dark:bg-red-950/40",
    iconClass: "text-red-600 dark:text-red-400",
    label: () => "Removed a team member",
  },
  "membership.adminSet": {
    icon: IconShield,
    bgClass: "bg-indigo-50 dark:bg-indigo-950/40",
    iconClass: "text-indigo-600 dark:text-indigo-400",
    label: (l) =>
      l.payload?.isAdmin ? "Granted admin access" : "Revoked admin access",
  },
};

const DEFAULT_CONFIG: EventConfig = {
  icon: IconActivity,
  bgClass: "bg-muted",
  iconClass: "text-muted-foreground",
  label: (l) => l.eventType.replace(/\./g, " › "),
};

// ─── Actor type filter options ────────────────────────────────────────────────

type ActorFilter = "all" | "user" | "bot" | "system";
type CategoryFilter = "all" | "project" | "membership" | "organization";
type DateFilter = "all" | "today" | "7d" | "30d";

const ACTOR_FILTERS: { value: ActorFilter; label: string }[] = [
  { value: "all", label: "All actors" },
  { value: "user", label: "Users" },
  { value: "bot", label: "LINE Bot" },
  { value: "system", label: "System" },
];

const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All events" },
  { value: "project", label: "Projects" },
  { value: "membership", label: "Members" },
  { value: "organization", label: "Settings" },
];

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function dateFilterToAfterTs(f: DateFilter): number | undefined {
  const now = Date.now();
  if (f === "today") {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
  }
  if (f === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (f === "30d") return now - 30 * 24 * 60 * 60 * 1000;
  return undefined;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type LogEntry = {
  _id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorType: "user" | "bot" | "system";
  actorName: string;
  actorInitials: string | null;
  timestamp: number;
  payload?: Record<string, unknown>;
};

// ─── Actor avatar ─────────────────────────────────────────────────────────────

const USER_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return USER_COLORS[h % USER_COLORS.length];
}

function ActorAvatar({ log }: { log: LogEntry }) {
  if (log.actorType === "bot") {
    return (
      <span className="inline-flex items-center justify-center size-5 rounded-full bg-amber-100 dark:bg-amber-900/40 shrink-0">
        <IconRobot className="size-3 text-amber-600 dark:text-amber-400" />
      </span>
    );
  }
  if (log.actorType === "system") {
    return (
      <span className="inline-flex items-center justify-center size-5 rounded-full bg-muted shrink-0">
        <IconSettings className="size-3 text-muted-foreground" />
      </span>
    );
  }
  const initials = log.actorInitials ?? log.actorName.slice(0, 2).toUpperCase();
  return (
    <span className={`inline-flex items-center justify-center size-5 rounded-full text-[10px] font-semibold shrink-0 ${colorFor(log.actorName)}`}>
      {initials}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });

  const [search, setSearch] = useState("");
  const [actorFilter, setActorFilter] = useState<ActorFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  const queryArgs = useMemo(() => {
    if (!org) return null;
    return {
      organizationId: org._id,
      actorType: actorFilter !== "all" ? (actorFilter as "user" | "bot" | "system") : undefined,
      entityType: categoryFilter !== "all" ? categoryFilter : undefined,
      afterTs: dateFilterToAfterTs(dateFilter),
    };
  }, [org, actorFilter, categoryFilter, dateFilter]);

  const { results, status, loadMore } = usePaginatedQuery(
    api.auditLogs.listByOrg,
    queryArgs ?? "skip",
    { initialNumItems: 30 }
  );

  const isLoading = status === "LoadingFirstPage" || !org;

  const filtered = useMemo(() => {
    if (!search.trim()) return results;
    const q = search.toLowerCase();
    return results.filter((log) => {
      const cfg = EVENT_CONFIG[log.eventType] ?? DEFAULT_CONFIG;
      const label = cfg.label(log as unknown as LogEntry).toLowerCase();
      return label.includes(q) || log.actorName.toLowerCase().includes(q) || log.eventType.toLowerCase().includes(q);
    });
  }, [results, search]);

  const hasActiveFilters = actorFilter !== "all" || categoryFilter !== "all" || dateFilter !== "all" || search.trim() !== "";

  if (!org) return <ActivitySkeleton />;

  return (
    <PaywallGate organizationId={org._id}>
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Activity</h2>
            <p className="text-sm text-muted-foreground">
              Audit trail of all actions in {org?.name ?? "your organization"}
            </p>
          </div>
          {results.length > 0 && (
            <div className="shrink-0 rounded-lg border bg-muted/40 px-3 py-1.5 text-center">
              <p className="text-lg font-bold tabular-nums">{filtered.length}</p>
              <p className="text-xs text-muted-foreground">events</p>
            </div>
          )}
        </div>

        {/* Search + filters */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search events, actor names…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8 h-9 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <IconX className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Category */}
            {CATEGORY_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setCategoryFilter(f.value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  categoryFilter === f.value
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
            <div className="w-px bg-border mx-1 self-stretch" />
            {/* Actor */}
            {ACTOR_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setActorFilter(f.value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  actorFilter === f.value
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
            <div className="w-px bg-border mx-1 self-stretch" />
            {/* Date */}
            {DATE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setDateFilter(f.value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  dateFilter === f.value
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
            {hasActiveFilters && (
              <button
                onClick={() => { setSearch(""); setActorFilter("all"); setCategoryFilter("all"); setDateFilter("all"); }}
                className="text-xs px-2.5 py-1 rounded-full border border-destructive/40 text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-1"
              >
                <IconX className="size-3" /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Timeline */}
        {isLoading ? (
          <ActivitySkeleton />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
              <IconHistory className="size-7 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium">{hasActiveFilters ? "No matching events" : "No activity yet"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {hasActiveFilters
                  ? "Try adjusting your search or filters."
                  : "Creating projects, advancing stages, and updating settings will appear here."}
              </p>
            </div>
          </div>
        ) : (
          <div className="relative flex flex-col">
            {/* Vertical timeline line */}
            <div className="absolute left-[19px] top-4 bottom-4 w-px bg-border" />

            {filtered.map((log, i) => {
              const cfg = EVENT_CONFIG[log.eventType] ?? DEFAULT_CONFIG;
              const Icon = cfg.icon;
              const showDateDivider =
                i === 0 ||
                toDateLabel(log.timestamp) !== toDateLabel(filtered[i - 1].timestamp);

              return (
                <div key={log._id}>
                  {showDateDivider && (
                    <div className="flex items-center gap-3 py-3 pl-10">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {toDateLabel(log.timestamp)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-start gap-4 py-2.5">
                    {/* Event icon bubble on the timeline */}
                    <div
                      className={`relative z-10 size-10 rounded-full flex items-center justify-center shrink-0 ${cfg.bgClass}`}
                    >
                      <Icon className={`size-4 ${cfg.iconClass}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-1.5">
                      <p className="text-sm leading-snug">
                        {cfg.label(log as unknown as LogEntry)}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                        <ActorAvatar log={log as unknown as LogEntry} />
                        <span className="font-medium">{log.actorName}</span>
                        <span>·</span>
                        <span>{toTimeLabel(log.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Load more / loading */}
            <div className="pt-4 pl-14">
              {status === "CanLoadMore" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => loadMore(30)}
                >
                  <IconHistory className="size-3.5" />
                  Load older activity
                </Button>
              )}
              {status === "LoadingMore" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconLoader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PaywallGate>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function toTimeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ActivitySkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-4">
          <Skeleton className="size-10 rounded-full shrink-0" />
          <div className="flex flex-col gap-1.5 flex-1 pt-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

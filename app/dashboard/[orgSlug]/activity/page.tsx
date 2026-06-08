"use client";

import { use } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconActivity,
  IconArchive,
  IconArrowMoveRight,
  IconCircleCheck,
  IconChevronsRight,
  IconFolderPlus,
  IconHistory,
  IconLoader2,
  IconSettings,
  IconShield,
  IconUserMinus,
  IconUserPlus,
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

// ─── Types ────────────────────────────────────────────────────────────────────

type LogEntry = {
  _id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorType: string;
  actorName: string;
  timestamp: number;
  payload?: Record<string, unknown>;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });

  const { results, status, loadMore } = usePaginatedQuery(
    api.auditLogs.listByOrg,
    org ? { organizationId: org._id } : "skip",
    { initialNumItems: 30 }
  );

  const isLoading = status === "LoadingFirstPage" || !org;

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div>
        <h2 className="text-xl font-semibold">Activity</h2>
        <p className="text-sm text-muted-foreground">
          Audit trail of all actions in {org?.name ?? "your organization"}
        </p>
      </div>

      {isLoading ? (
        <ActivitySkeleton />
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <IconHistory className="size-10 text-muted-foreground/30" />
          <p className="text-sm font-medium">No activity yet</p>
          <p className="text-xs text-muted-foreground">
            Actions like creating projects, advancing stages, and updating settings
            will appear here.
          </p>
        </div>
      ) : (
        <div className="relative flex flex-col">
          {/* Vertical timeline line */}
          <div className="absolute left-[19px] top-4 bottom-4 w-px bg-border" />

          {results.map((log, i) => {
            const cfg = EVENT_CONFIG[log.eventType] ?? DEFAULT_CONFIG;
            const Icon = cfg.icon;
            const showDateDivider =
              i === 0 ||
              toDateLabel(log.timestamp) !== toDateLabel(results[i - 1].timestamp);

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
                  {/* Icon bubble sits on the timeline */}
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
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                      <span className="font-medium">{log.actorName}</span>
                      <span>·</span>
                      <span>{toTimeLabel(log.timestamp)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Load more */}
          <div className="pt-4 pl-10">
            {status === "CanLoadMore" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadMore(30)}
              >
                Load more
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

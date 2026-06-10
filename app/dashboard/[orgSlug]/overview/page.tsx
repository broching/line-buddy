"use client";

import { use } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconActivity,
  IconArrowMoveRight,
  IconChartLine,
  IconCircleCheck,
  IconFolderOpen,
  IconFolderPlus,
  IconMessage2,
  IconTemplate,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import { CreditUsageCards } from "@/components/billing/credit-usage";
import { PaywallGate } from "@/components/billing/paywall-gate";

export default function OverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const members = useQuery(
    api.memberships.list,
    org ? { organizationId: org._id } : "skip"
  );
  const projects = useQuery(
    api.projects.list,
    org ? { organizationId: org._id } : "skip"
  );
  const groups = useQuery(
    api.groupChats.list,
    org ? { organizationId: org._id } : "skip"
  );
  const templates = useQuery(
    api.workflowTemplates.list,
    org ? { organizationId: org._id } : "skip"
  );

  const { results: recentActivity } = usePaginatedQuery(
    api.auditLogs.listByOrg,
    org ? { organizationId: org._id } : "skip",
    { initialNumItems: 5 }
  );

  if (!org) return <OverviewSkeleton />;

  const activeProjects = projects?.filter((p) => p.status === "active") ?? [];
  const completedProjects = projects?.filter((p) => p.status === "completed") ?? [];

  return (
    <PaywallGate organizationId={org._id}>
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div>
        <h2 className="text-2xl font-bold">{org.name}</h2>
        <p className="text-muted-foreground text-sm">
          Welcome back. Here's what's happening.
        </p>
      </div>

      {/* ── Credit & storage usage ───────────────────────────────────────────── */}
      <CreditUsageCards organizationId={org._id} />

      {/* ── Metric cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Team members"
          value={members?.length ?? "—"}
          icon={<IconUsers className="size-4 text-muted-foreground" />}
        />
        <MetricCard
          title="Active projects"
          value={activeProjects.length}
          sub={completedProjects.length > 0 ? `${completedProjects.length} completed` : undefined}
          icon={<IconFolderOpen className="size-4 text-muted-foreground" />}
        />
        <MetricCard
          title="Connected groups"
          value={groups?.filter((g) => g.isActive).length ?? "—"}
          icon={<IconMessage2 className="size-4 text-muted-foreground" />}
        />
        <MetricCard
          title="Templates"
          value={templates?.length ?? "—"}
          icon={<IconTemplate className="size-4 text-muted-foreground" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Active projects quick view ───────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-medium">Active projects</CardTitle>
            <Link
              href={`/dashboard/${orgSlug}/projects`}
              className="text-xs text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {activeProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No active projects yet
              </p>
            ) : (
              <div className="flex flex-col divide-y">
                {activeProjects.slice(0, 5).map((p) => (
                  <Link
                    key={p._id}
                    href={`/dashboard/${orgSlug}/projects/${p._id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:text-primary transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <IconFolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{p.name}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      Stage {p.currentStageOrder}
                    </Badge>
                  </Link>
                ))}
                {activeProjects.length > 5 && (
                  <p className="text-xs text-muted-foreground pt-2">
                    +{activeProjects.length - 5} more
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Recent activity ───────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-medium">Recent activity</CardTitle>
            <Link
              href={`/dashboard/${orgSlug}/activity`}
              className="text-xs text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No activity yet
              </p>
            ) : (
              <div className="flex flex-col divide-y">
                {recentActivity.map((log) => (
                  <div key={log._id} className="flex items-center gap-3 py-2.5">
                    <ActivityDot eventType={log.eventType} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">{describeEvent(log)}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.actorName} ·{" "}
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Quick links ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Analytics", icon: IconChartLine, href: `analytics` },
          { label: "Activity log", icon: IconActivity, href: `activity` },
          { label: "Templates", icon: IconTemplate, href: `templates` },
          { label: "Members", icon: IconUsers, href: `members` },
        ].map((item) => (
          <Link
            key={item.label}
            href={`/dashboard/${orgSlug}/${item.href}`}
            className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            <item.icon className="size-4 text-muted-foreground" />
            {item.label}
          </Link>
        ))}
      </div>
    </div>
    </PaywallGate>
  );
}

// ─── Activity helpers ─────────────────────────────────────────────────────────

function ActivityDot({ eventType }: { eventType: string }) {
  const colorMap: Record<string, string> = {
    "project.created": "bg-blue-500",
    "project.completed": "bg-green-500",
    "project.stageAdvanced": "bg-primary",
    "project.stageSkipped": "bg-amber-500",
    "project.archived": "bg-muted-foreground",
    "membership.added": "bg-teal-500",
    "membership.removed": "bg-red-500",
  };
  return (
    <div
      className={`size-2 rounded-full shrink-0 ${colorMap[eventType] ?? "bg-muted-foreground"}`}
    />
  );
}

function describeEvent(log: { eventType: string; payload?: Record<string, unknown> }) {
  switch (log.eventType) {
    case "project.created":
      return `Created project "${log.payload?.name ?? "—"}"`;
    case "project.completed":
      return `Completed project "${log.payload?.projectName ?? "—"}"`;
    case "project.stageAdvanced":
      return `Stage advanced → ${log.payload?.toStageName ?? `#${log.payload?.toStageOrder}`}`;
    case "project.stageSkipped":
      return `Skipped stage ${log.payload?.skippedOrder ?? ""}`;
    case "project.archived":
      return "Archived a project";
    case "organization.lineCredentialsUpdated":
      return "Updated LINE credentials";
    case "membership.added":
      return "Added a team member";
    case "membership.removed":
      return "Removed a team member";
    default:
      return log.eventType.replace(/\./g, " › ");
  }
}

// ─── Shared components ────────────────────────────────────────────────────────

function MetricCard({
  title,
  value,
  icon,
  sub,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}

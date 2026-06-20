"use client";

import { use, useEffect, useState } from "react";
import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import {
  IconBrain,
  IconCircleCheck,
  IconCoins,
  IconExternalLink,
  IconFolderOpen,
  IconLoader2,
  IconMessage2,
  IconSearch,
} from "@tabler/icons-react";
import { CreditUsageCards } from "@/components/billing/credit-usage";
import { PaywallGate } from "@/components/billing/paywall-gate";

// ─── Color palettes ───────────────────────────────────────────────────────────

const PROJECT_COLORS: Record<string, string> = {
  Active: "#3b82f6",
  Completed: "#22c55e",
  Paused: "#f59e0b",
  Archived: "#94a3b8",
};

const REMINDER_COLORS: Record<string, string> = {
  Sent: "#22c55e",
  Scheduled: "#3b82f6",
  Failed: "#ef4444",
  Cancelled: "#94a3b8",
};

const TOOLTIP_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "12px",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const summary = useQuery(
    api.analytics.getSummary,
    org ? { organizationId: org._id } : "skip"
  );

  if (!org || summary === undefined) return <AnalyticsSkeleton />;

  // Build last-14-days bar chart data (client-side so "today" is always correct)
  const messageChartData = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    return {
      date: d.toLocaleDateString([], { month: "short", day: "numeric" }),
      Messages: summary?.messages.byDay[key] ?? 0,
    };
  });

  const projectPieData = [
    { name: "Active", value: summary.projects.active },
    { name: "Completed", value: summary.projects.completed },
    { name: "Paused", value: summary.projects.paused },
    { name: "Archived", value: summary.projects.archived },
  ].filter((d) => d.value > 0);

  const reminderPieData = [
    { name: "Sent", value: summary.reminders.sent },
    { name: "Scheduled", value: summary.reminders.scheduled },
    { name: "Failed", value: summary.reminders.failed },
    { name: "Cancelled", value: summary.reminders.cancelled },
  ].filter((d) => d.value > 0);

  const completionRate =
    summary.projects.total > 0
      ? Math.round((summary.projects.completed / summary.projects.total) * 100)
      : 0;

  return (
    <PaywallGate organizationId={org._id}>
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div>
        <h2 className="text-xl font-semibold">Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Workflow activity overview for {org.name}
        </p>
      </div>

      {/* ── Credit & storage usage ───────────────────────────────────────────── */}
      <CreditUsageCards organizationId={org._id} topUpUrl={`/dashboard/${orgSlug}/settings/billing`} />

      {/* ── AI credit usage history ──────────────────────────────────────────── */}
      <CreditUsageHistory organizationId={org._id} orgSlug={orgSlug} />

      {/* ── Top metric cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<IconFolderOpen className="size-4 text-blue-600 dark:text-blue-400" />}
          iconBg="bg-blue-500/10"
          label="Total projects"
          value={summary.projects.total}
          sub={`${summary.projects.active} active`}
        />
        <StatCard
          icon={<IconCircleCheck className="size-4 text-green-600 dark:text-green-400" />}
          iconBg="bg-green-500/10"
          label="Completion rate"
          value={`${completionRate}%`}
          sub={`${summary.projects.completed} completed`}
        />
        <StatCard
          icon={<IconMessage2 className="size-4 text-violet-600 dark:text-violet-400" />}
          iconBg="bg-violet-500/10"
          label="Messages (14d)"
          value={summary.messages.last14Days}
          sub="in LINE groups"
        />
        <StatCard
          icon={<IconBrain className="size-4 text-sky-600 dark:text-sky-400" />}
          iconBg="bg-sky-500/10"
          label="AI extraction rate"
          value={`${summary.messages.extractionRate}%`}
          sub={`${summary.messages.extractedCount} processed`}
        />
      </div>

      {/* ── Daily messages bar chart ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Messages per day — last 14 days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary.messages.last14Days === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
              No messages in the last 14 days
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={messageChartData}
                margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)" }} />
                <Bar
                  dataKey="Messages"
                  fill="#3b82f6"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Two donut charts ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Projects by status</CardTitle>
          </CardHeader>
          <CardContent>
            {projectPieData.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                No projects yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={projectPieData}
                    cx="40%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={78}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {projectPieData.map((entry) => (
                      <Cell key={entry.name} fill={PROJECT_COLORS[entry.name] ?? "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Reminder delivery</CardTitle>
          </CardHeader>
          <CardContent>
            {reminderPieData.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                No reminders yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={reminderPieData}
                    cx="40%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={78}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {reminderPieData.map((entry) => (
                      <Cell key={entry.name} fill={REMINDER_COLORS[entry.name] ?? "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </PaywallGate>
  );
}

// ─── Credit usage history ─────────────────────────────────────────────────────

type UsageEntry = {
  _id: Id<"creditTransactions">;
  amount: number;
  description: string;
  createdAt: number;
  metadata?: { totalTokens?: number; inputTokens?: number; outputTokens?: number } | null;
  message: { _id: Id<"messages">; text: string | null } | null;
  groupChat: { _id: Id<"groupChats">; name: string } | null;
  project: { _id: Id<"projects">; name: string } | null;
};

function CreditUsageHistory({
  organizationId,
  orgSlug,
}: {
  organizationId: Id<"organizations">;
  orgSlug: string;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState<string>("__all__");

  // Debounce the search box so we don't re-query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const projects = useQuery(api.projects.list, { organizationId }) as
    | Array<{ _id: Id<"projects">; name: string }>
    | undefined;

  const { results: entries, status, loadMore } = usePaginatedQuery(
    api.billing.getUsageHistory,
    {
      organizationId,
      search: search || undefined,
      projectId: projectId === "__all__" ? undefined : (projectId as Id<"projects">),
    },
    { initialNumItems: 20 }
  );
  const usageEntries = entries as UsageEntry[];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <IconCoins className="size-4 text-amber-500" />
              AI credit usage
            </CardTitle>
            <CardDescription>One credit per AI pipeline run — click a message to view it in the group chat</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search usage…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-8 w-44 pl-8 text-xs"
              />
            </div>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All projects</SelectItem>
                {(projects ?? []).map((p) => (
                  <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {status === "LoadingFirstPage" ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
          </div>
        ) : usageEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No matching usage entries.</p>
        ) : (
          <>
            <div className="flex flex-col divide-y max-h-[420px] overflow-y-auto pr-1">
              {usageEntries.map((entry) => {
                const tokens = entry.metadata?.totalTokens;
                const groupLink = entry.groupChat && entry.message
                  ? `/dashboard/${orgSlug}/groups/${entry.groupChat._id}`
                  : null;
                const preview = entry.message?.text
                  ? entry.message.text.slice(0, 60) + (entry.message.text.length > 60 ? "…" : "")
                  : null;

                return (
                  <div key={entry._id} className="flex items-center justify-between py-3 gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant="outline" className="text-xs shrink-0 bg-amber-500/10 text-amber-600 border-amber-500/20">
                        Usage
                      </Badge>
                      <div className="min-w-0">
                        {groupLink ? (
                          <Link
                            href={groupLink}
                            className="flex items-center gap-1 text-sm text-foreground hover:underline underline-offset-2 group truncate"
                          >
                            <span className="truncate">
                              {entry.groupChat?.name}
                              {preview && <span className="text-muted-foreground"> — {preview}</span>}
                            </span>
                            <IconExternalLink className="size-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {tokens ? `AI processing (${tokens.toLocaleString()} tokens)` : "AI processing"}
                          </span>
                        )}
                        <div className="flex items-center gap-2">
                          {entry.project && (
                            <Badge variant="secondary" className="text-[10px] py-0 h-4 shrink-0">
                              {entry.project.name}
                            </Badge>
                          )}
                          {tokens && groupLink && (
                            <p className="text-xs text-muted-foreground">{tokens.toLocaleString()} tokens</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1">
                        <IconCoins className="size-3 text-amber-500 shrink-0" />
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {Math.abs(entry.amount)}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground w-32 text-right hidden sm:block">
                        {new Date(entry.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {status === "CanLoadMore" && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" size="sm" onClick={() => loadMore(20)}>
                  Load more
                </Button>
              </div>
            )}
            {status === "LoadingMore" && (
              <div className="flex justify-center pt-4">
                <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  iconBg = "bg-muted",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  iconBg?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <div className="text-2xl font-bold mt-1">{value}</div>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
      </div>
    </div>
  );
}

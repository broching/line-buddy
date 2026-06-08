"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconBrain,
  IconCircleCheck,
  IconFolderOpen,
  IconMessage2,
} from "@tabler/icons-react";

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
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
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
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div>
        <h2 className="text-xl font-semibold">Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Workflow activity overview for {org.name}
        </p>
      </div>

      {/* ── Top metric cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<IconFolderOpen className="size-4 text-blue-500" />}
          label="Total projects"
          value={summary.projects.total}
          sub={`${summary.projects.active} active`}
        />
        <StatCard
          icon={<IconCircleCheck className="size-4 text-green-500" />}
          label="Completion rate"
          value={`${completionRate}%`}
          sub={`${summary.projects.completed} completed`}
        />
        <StatCard
          icon={<IconMessage2 className="size-4 text-violet-500" />}
          label="Messages (14d)"
          value={summary.messages.last14Days}
          sub="in LINE groups"
        />
        <StatCard
          icon={<IconBrain className="size-4 text-sky-500" />}
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
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--muted))" }} />
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
          <CardContent className="flex items-center justify-center">
            {projectPieData.length === 0 ? (
              <p className="py-10 text-sm text-muted-foreground">No projects yet</p>
            ) : (
              <PieChart width={260} height={180}>
                <Pie
                  data={projectPieData}
                  cx={90}
                  cy={80}
                  innerRadius={44}
                  outerRadius={70}
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
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Reminder delivery</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {reminderPieData.length === 0 ? (
              <p className="py-10 text-sm text-muted-foreground">No reminders yet</p>
            ) : (
              <PieChart width={260} height={180}>
                <Pie
                  data={reminderPieData}
                  cx={90}
                  cy={80}
                  innerRadius={44}
                  outerRadius={70}
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
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

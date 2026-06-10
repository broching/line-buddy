"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { IconSparkles, IconDatabase } from "@tabler/icons-react";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function CreditUsageCards({ organizationId }: { organizationId: Id<"organizations"> }) {
  const billing = useQuery(api.billing.getForOrg, { organizationId });

  if (!billing) return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-28 rounded-xl" />
    </div>
  );

  const periodEnd = billing.creditsPeriodEnd
    ? new Date(billing.creditsPeriodEnd).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* Credits */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">AI Credits</CardTitle>
          <IconSparkles className="size-4 text-violet-500" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold">
              {billing.isActive ? billing.creditsRemaining.toLocaleString() : "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              {billing.isActive ? `/ ${billing.creditsTotal.toLocaleString()} total` : "No active plan"}
            </span>
          </div>
          {billing.isActive && (
            <>
              <Progress value={100 - billing.creditsPct} className="h-1.5" />
              <p className="text-xs text-muted-foreground">
                {billing.creditsUsed.toLocaleString()} used
                {periodEnd ? ` · resets ${periodEnd}` : ""}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Storage */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Knowledge Storage</CardTitle>
          <IconDatabase className="size-4 text-sky-500" />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold">
              {billing.isActive ? formatBytes(billing.storageUsedBytes) : "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              {billing.isActive ? `/ ${formatBytes(billing.storageLimitBytes)}` : "No active plan"}
            </span>
          </div>
          {billing.isActive && (
            <>
              <Progress value={billing.storagePct} className="h-1.5" />
              <p className="text-xs text-muted-foreground">
                {billing.storagePct}% used
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Compact inline badge for chat header
export function CreditBadge({ organizationId }: { organizationId: Id<"organizations"> }) {
  const billing = useQuery(api.billing.getForOrg, { organizationId });
  if (!billing || !billing.isActive) return null;

  const pctUsed = billing.creditsPct;
  const color =
    pctUsed >= 90 ? "text-red-500" :
    pctUsed >= 70 ? "text-amber-500" :
    "text-muted-foreground";

  return (
    <span className={`flex items-center gap-1 text-xs ${color}`}>
      <IconSparkles className="size-3" />
      {billing.creditsRemaining.toLocaleString()} credits
    </span>
  );
}

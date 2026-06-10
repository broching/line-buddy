"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { IconCoins, IconDatabase, IconPlus } from "@tabler/icons-react";
import Link from "next/link";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function CreditUsageCards({
  organizationId,
  topUpUrl,
}: {
  organizationId: Id<"organizations">;
  topUpUrl?: string;
}) {
  const billing = useQuery(api.billing.getForOrg, { organizationId });

  if (!billing) return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Skeleton className="h-[108px] rounded-xl" />
      <Skeleton className="h-[108px] rounded-xl" />
    </div>
  );

  const periodEnd = billing.creditsPeriodEnd
    ? new Date(billing.creditsPeriodEnd).toLocaleDateString([], {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* ── AI Credits ────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="px-4 pt-4 pb-4 flex flex-col gap-2">
          {/* Header: icon + label + top-up button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <IconCoins className="size-5 text-amber-500" />
              </div>
              <span className="text-sm font-semibold">AI Credits</span>
            </div>
            {topUpUrl && (
              <Link
                href={topUpUrl}
                className="flex items-center gap-1 rounded-lg border border-amber-500/30 px-2.5 py-1.5 text-xs font-medium text-amber-500 hover:bg-amber-500/10 transition-colors"
              >
                <IconPlus className="size-3" />
                Top up
              </Link>
            )}
          </div>

          {/* Balance */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tabular-nums">
              {billing.isActive ? billing.creditsRemaining.toLocaleString() : "—"}
            </span>
            {billing.isActive && (
              <span className="text-sm font-semibold text-amber-500">credits</span>
            )}
          </div>

          {/* Subtitle */}
          <p className="text-xs text-muted-foreground -mt-1">
            {billing.isActive
              ? `${billing.creditsUsed.toLocaleString()} used this period${periodEnd ? ` · resets ${periodEnd}` : ""}`
              : "No active plan"}
          </p>

          {/* Progress bar */}
          {billing.isActive && (
            <Progress
              value={100 - billing.creditsPct}
              className="h-1 [&>div]:bg-amber-500"
            />
          )}
        </CardContent>
      </Card>

      {/* ── Knowledge Storage ─────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="px-4 pt-4 pb-4 flex flex-col gap-2">
          {/* Header: icon + label */}
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-sky-500/15 flex items-center justify-center shrink-0">
              <IconDatabase className="size-5 text-sky-500" />
            </div>
            <span className="text-sm font-semibold">Knowledge Storage</span>
          </div>

          {/* Used */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tabular-nums">
              {billing.isActive ? formatBytes(billing.storageUsedBytes) : "—"}
            </span>
          </div>

          {/* Subtitle */}
          <p className="text-xs text-muted-foreground -mt-1">
            {billing.isActive
              ? `of ${formatBytes(billing.storageLimitBytes)} · ${billing.storagePct}% used`
              : "No active plan"}
          </p>

          {/* Progress bar */}
          {billing.isActive && (
            <Progress
              value={billing.storagePct}
              className="h-1 [&>div]:bg-sky-500"
            />
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
      <IconCoins className="size-3" />
      {billing.creditsRemaining.toLocaleString()} credits
    </span>
  );
}

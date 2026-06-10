"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { useClerk } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";
import { api } from "@/convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PricingTable } from "@clerk/nextjs";
import {
  IconSparkles,
  IconDatabase,
  IconUsers,
  IconCircleCheck,
  IconAlertCircle,
  IconCreditCard,
} from "@tabler/icons-react";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function BillingPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const billing = useQuery(
    api.billing.getForOrg,
    org ? { organizationId: org._id } : "skip"
  );
  const members = useQuery(
    api.memberships.list,
    org ? { organizationId: org._id } : "skip"
  );
  const { openUserProfile } = useClerk();
  const { theme } = useTheme();

  if (!org || billing === undefined) return <BillingSkeleton />;

  const periodEnd = billing.creditsPeriodEnd
    ? new Date(billing.creditsPeriodEnd).toLocaleDateString([], {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const seatCount = members?.length ?? 0;
  const seatPct = billing.isActive
    ? Math.round((seatCount / billing.maxSeats) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold">Billing</h2>
        <p className="text-muted-foreground text-sm">
          Manage your subscription and track resource usage.
        </p>
      </div>

      {/* ── Plan status ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">Current plan</CardTitle>
            <CardDescription>
              {billing.isActive ? `Renews ${periodEnd ?? "—"}` : "No active subscription"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {billing.isActive ? (
              <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
                <IconCircleCheck className="size-3" />
                Active
              </Badge>
            ) : billing.status === "past_due" ? (
              <Badge variant="destructive" className="gap-1">
                <IconAlertCircle className="size-3" />
                Past due
              </Badge>
            ) : (
              <Badge variant="outline">Free</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() =>
              openUserProfile({
                appearance: { baseTheme: theme === "dark" ? dark : undefined },
              })
            }
          >
            <IconCreditCard className="size-4" />
            Manage subscription
          </Button>
        </CardContent>
      </Card>

      {/* ── Usage cards ──────────────────────────────────────────────────────── */}
      {billing.isActive && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Credits */}
            <UsageCard
              icon={<IconSparkles className="size-4 text-violet-500" />}
              label="AI Credits"
              used={billing.creditsUsed}
              total={billing.creditsTotal}
              pct={billing.creditsPct}
              usedLabel={`${billing.creditsUsed.toLocaleString()} / ${billing.creditsTotal.toLocaleString()}`}
            />
            {/* Storage */}
            <UsageCard
              icon={<IconDatabase className="size-4 text-sky-500" />}
              label="Knowledge Storage"
              used={billing.storageUsedBytes}
              total={billing.storageLimitBytes}
              pct={billing.storagePct}
              usedLabel={`${formatBytes(billing.storageUsedBytes)} / ${formatBytes(billing.storageLimitBytes)}`}
            />
            {/* Seats */}
            <UsageCard
              icon={<IconUsers className="size-4 text-teal-500" />}
              label="Team Seats"
              used={seatCount}
              total={billing.maxSeats}
              pct={seatPct}
              usedLabel={`${seatCount} / ${billing.maxSeats} seats`}
            />
          </div>
        </>
      )}

      {/* ── Pricing table for upgrade ─────────────────────────────────────────── */}
      {!billing.isActive && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Choose a plan</CardTitle>
            <CardDescription>
              Subscribe to unlock all features for {org.name}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PricingTable />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UsageCard({
  icon,
  label,
  used,
  total,
  pct,
  usedLabel,
}: {
  icon: React.ReactNode;
  label: string;
  used: number;
  total: number;
  pct: number;
  usedLabel: string;
}) {
  const barColor =
    pct >= 90 ? "[&>div]:bg-red-500" :
    pct >= 70 ? "[&>div]:bg-amber-500" :
    "";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Progress value={pct} className={`h-2 ${barColor}`} />
        <p className="text-xs text-muted-foreground">{usedLabel} used</p>
      </CardContent>
    </Card>
  );
}

function BillingSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 max-w-2xl">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    </div>
  );
}

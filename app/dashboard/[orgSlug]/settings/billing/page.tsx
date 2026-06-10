"use client";

import { use, useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { AddPaymentMethodModal } from "@/components/billing/add-payment-method-modal";
import { useClerk, PricingTable } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { CREDIT_PACKS, PACK_IDS, PackId } from "@/convex/lib/creditPacks";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconCoins,
  IconDatabase,
  IconUsers,
  IconCircleCheck,
  IconAlertCircle,
  IconCreditCard,
  IconBolt,
  IconReceipt,
  IconRefresh,
  IconTrash,
  IconShield,
  IconPlus,
} from "@tabler/icons-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
};

type Transaction = {
  _id: string;
  type: "purchase" | "auto_recharge" | "usage" | "refund" | "admin_adjustment";
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: number;
  metadata?: { priceSGD?: number; packId?: string } | null;
};

type ClerkPayment = {
  paymentId: string;
  paidAt: number;
  amountFormatted: string;
  currencySymbol: string;
  planName: string;
  cardType: string;
  last4: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAN_NAMES: Record<string, string> = {
  cplan_3Ek3Jnh7a5kSARlBfINVtBSCetn: "Pro Plan",
  free: "Free Plan",
};

function getPlanName(planId: string): string {
  return PLAN_NAMES[planId] ?? "Active Plan";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function txTypeLabel(type: Transaction["type"]): string {
  switch (type) {
    case "purchase": return "Purchase";
    case "auto_recharge": return "Auto-recharge";
    case "usage": return "Usage";
    case "refund": return "Refund";
    case "admin_adjustment": return "Adjustment";
  }
}

function txBadgeClass(type: Transaction["type"]): string {
  if (type === "usage") return "bg-orange-500/10 text-orange-600 border-orange-500/20";
  if (type === "purchase" || type === "auto_recharge") return "bg-green-500/10 text-green-600 border-green-500/20";
  return "bg-muted text-muted-foreground";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const { theme } = useTheme();
  const { openOrganizationProfile } = useClerk();

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [pmLoading, setPmLoading] = useState(true);
  const [addCardOpen, setAddCardOpen] = useState(false);

  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const billing = useQuery(
    api.billing.getForOrg,
    org ? { organizationId: org._id } : "skip"
  );
  const members = useQuery(
    api.memberships.list,
    org ? { organizationId: org._id } : "skip"
  );
  const transactions = useQuery(
    api.billing.getTransactionHistory,
    org ? { organizationId: org._id, limit: 20 } : "skip"
  );
  const clerkPayments = useQuery(
    api.billing.getClerkPaymentAttempts,
    org ? { organizationId: org._id, limit: 20 } : "skip"
  );

  const getPaymentMethods = useAction(api.stripe.getPaymentMethods);

  const fetchPaymentMethods = useCallback(async () => {
    if (!org) return;
    setPmLoading(true);
    try {
      const result = await getPaymentMethods({ organizationId: org._id });
      setPaymentMethods(result.paymentMethods);
    } catch {
      // Stripe customer not yet created — OK
    } finally {
      setPmLoading(false);
    }
  }, [org, getPaymentMethods]);

  useEffect(() => { fetchPaymentMethods(); }, [fetchPaymentMethods]);

  if (!org || billing === undefined) return <BillingSkeleton />;

  const periodEnd = billing.creditsPeriodEnd
    ? new Date(billing.creditsPeriodEnd).toLocaleDateString([], {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const seatCount = members?.length ?? 0;
  const seatPct = billing.isActive ? Math.round((seatCount / billing.maxSeats) * 100) : 0;
  const creditsRemaining = billing.creditsRemaining;

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 py-2">
      <div>
        <h2 className="text-xl font-semibold">Billing</h2>
        <p className="text-muted-foreground text-sm">
          Manage your subscription, buy AI credits, and configure auto-recharge.
        </p>
      </div>

      {/* ── Row 1: Subscription + Credit Balance ─────────────────────────────── */}
      <div className={`grid grid-cols-1 gap-4 ${billing.isActive ? "lg:grid-cols-2" : ""}`}>
        {/* Subscription */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm font-medium">{getPlanName(billing.planId)}</CardTitle>
              <CardDescription>
                {billing.isActive ? `Renews ${periodEnd ?? "—"}` : "No active subscription"}
              </CardDescription>
            </div>
            {billing.isActive ? (
              <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20 shrink-0">
                <IconCircleCheck className="size-3" />
                Active
              </Badge>
            ) : billing.status === "past_due" ? (
              <Badge variant="destructive" className="gap-1 shrink-0">
                <IconAlertCircle className="size-3" />
                Past due
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0">Free</Badge>
            )}
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() =>
                openOrganizationProfile({
                  appearance: { baseTheme: theme === "dark" ? dark : undefined },
                })
              }
            >
              <IconCreditCard className="size-4" />
              Manage subscription
            </Button>
          </CardContent>
        </Card>

        {/* Credit balance — shown only when subscribed */}
        {billing.isActive && (
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
                {org && (
                  <BuyCreditsQuickButton
                    organizationId={org._id}
                    returnPath={`/dashboard/${orgSlug}/settings/billing`}
                  />
                )}
              </div>
              {/* Balance */}
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold tabular-nums tracking-tight">
                  {creditsRemaining.toLocaleString()}
                </span>
                <span className="text-base text-amber-500 font-semibold">credits</span>
              </div>
              {/* Subtitle */}
              <p className="text-xs text-muted-foreground -mt-1">
                {billing.creditsUsed.toLocaleString()} used this period
                {periodEnd ? ` · resets ${periodEnd}` : ""}
              </p>
              {/* Progress bar */}
              {billing.creditsTotal > 0 && (
                <Progress
                  value={100 - billing.creditsPct}
                  className="h-1 [&>div]:bg-amber-500"
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Pricing table — shown when no active subscription ────────────────── */}
      {!billing.isActive && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Choose a plan for {org.name}</CardTitle>
            <CardDescription>
              Subscribe to unlock AI credits, storage, and team seats.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <PricingTable
              for="organization"
              appearance={{
                baseTheme: theme === "dark" ? dark : undefined,
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Row 2: Storage + Team Seats ──────────────────────────────────────── */}
      {billing.isActive && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UsageCard
            icon={<IconDatabase className="size-4 text-sky-500" />}
            label="Knowledge Storage"
            pct={billing.storagePct}
            usedLabel={`${formatBytes(billing.storageUsedBytes)} used`}
            totalLabel={`of ${formatBytes(billing.storageLimitBytes)}`}
          />
          <UsageCard
            icon={<IconUsers className="size-4 text-teal-500" />}
            label="Team Seats"
            pct={seatPct}
            usedLabel={`${seatCount} seats used`}
            totalLabel={`of ${billing.maxSeats}`}
          />
        </div>
      )}

      {/* ── Row 3: Buy AI Credits ─────────────────────────────────────────────── */}
      {billing.isActive && org && (
        <CreditPacksSection
          organizationId={org._id}
          returnPath={`/dashboard/${orgSlug}/settings/billing`}
        />
      )}

      {/* ── Row 4: Auto-recharge + Payment Method ────────────────────────────── */}
      {billing.isActive && org && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AutoRechargeSection
              organizationId={org._id}
              billing={billing}
              hasPaymentMethod={paymentMethods.length > 0}
              onAddCard={() => setAddCardOpen(true)}
            />
            <PaymentMethodSection
              paymentMethods={paymentMethods}
              loading={pmLoading}
              onAdd={() => setAddCardOpen(true)}
              onRefresh={fetchPaymentMethods}
              organizationId={org._id}
            />
          </div>
          <AddPaymentMethodModal
            organizationId={org._id}
            open={addCardOpen}
            onOpenChange={setAddCardOpen}
            onSuccess={fetchPaymentMethods}
          />
        </>
      )}

      {/* ── Row 5: Transaction history ───────────────────────────────────────── */}
      {billing.isActive && (
        <TransactionHistorySection
          transactions={transactions as Transaction[] | undefined}
          clerkPayments={clerkPayments as ClerkPayment[] | undefined}
        />
      )}
    </div>
  );
}

// ─── Quick buy button on the credit balance card ──────────────────────────────

function BuyCreditsQuickButton({
  organizationId,
  returnPath,
}: {
  organizationId: Id<"organizations">;
  returnPath: string;
}) {
  const createCheckout = useAction(api.stripe.createCheckoutSession);
  const [loading, setLoading] = useState(false);

  const handleBuy = async () => {
    setLoading(true);
    try {
      const result = await createCheckout({ organizationId, packId: "5000", returnPath });
      if (result?.url) window.location.href = result.url;
    } catch {
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5 shrink-0 border-amber-500/30 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600"
      disabled={loading}
      onClick={handleBuy}
    >
      <IconPlus className="size-3.5" />
      {loading ? "Loading…" : "Top up"}
    </Button>
  );
}

// ─── Credit pack grid ─────────────────────────────────────────────────────────

function CreditPacksSection({
  organizationId,
  returnPath,
}: {
  organizationId: Id<"organizations">;
  returnPath: string;
}) {
  const createCheckout = useAction(api.stripe.createCheckoutSession);
  const [loading, setLoading] = useState<PackId | null>(null);

  const handleBuy = async (packId: PackId) => {
    setLoading(packId);
    try {
      const result = await createCheckout({ organizationId, packId, returnPath });
      if (result?.url) window.location.href = result.url;
    } catch {
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <IconBolt className="size-4 text-amber-500" />
          Buy AI Credits
        </CardTitle>
        <CardDescription>
          Credits are added immediately after payment. 1 credit = 1,000 AI tokens.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PACK_IDS.map((packId) => {
            const pack = CREDIT_PACKS[packId];
            const isPopular = packId === "5000";
            return (
              <div
                key={packId}
                className={`relative flex flex-col gap-3 rounded-xl border p-4 transition-colors hover:border-amber-500/40 hover:bg-amber-500/5 ${
                  isPopular ? "border-amber-500/50 bg-amber-500/5" : ""
                }`}
              >
                {isPopular && (
                  <span className="absolute -top-2.5 left-3 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                    Popular
                  </span>
                )}
                <div className="flex items-center gap-1.5">
                  <IconCoins className="size-4 text-amber-500" />
                  <span className="text-lg font-bold tabular-nums">
                    {pack.credits.toLocaleString()}
                  </span>
                </div>
                <p className="text-lg font-semibold">{pack.priceDisplay}</p>
                <Button
                  size="sm"
                  variant={isPopular ? "default" : "outline"}
                  className={`w-full ${isPopular ? "bg-amber-500 hover:bg-amber-600 text-white border-0" : ""}`}
                  disabled={loading !== null}
                  onClick={() => handleBuy(packId)}
                >
                  {loading === packId ? "Loading…" : "Buy"}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Auto-recharge settings ───────────────────────────────────────────────────

function AutoRechargeSection({
  organizationId,
  billing,
  hasPaymentMethod,
  onAddCard,
}: {
  organizationId: Id<"organizations">;
  billing: {
    autoRechargeEnabled?: boolean;
    autoRechargeThreshold?: number | null;
    autoRechargePack?: string | null;
    monthlySpendLimitSGD?: number | null;
  };
  hasPaymentMethod: boolean;
  onAddCard: () => void;
}) {
  const updateAutoRecharge = useMutation(api.billing.updateAutoRechargeSettings);
  const updateMonthlyLimit = useMutation(api.billing.updateMonthlySpendLimit);

  const [enabled, setEnabled] = useState(billing.autoRechargeEnabled ?? false);
  const [threshold, setThreshold] = useState(String(billing.autoRechargeThreshold ?? 500));
  const [pack, setPack] = useState<PackId>((billing.autoRechargePack as PackId) ?? "5000");
  const [monthlyLimit, setMonthlyLimit] = useState(String(billing.monthlySpendLimitSGD ?? ""));
  const [saving, setSaving] = useState(false);
  const [savingCap, setSavingCap] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAutoRecharge({
        organizationId,
        enabled,
        threshold: enabled ? Number(threshold) : undefined,
        pack: enabled ? pack : undefined,
      });
      toast.success("Auto-recharge settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCap = async () => {
    setSavingCap(true);
    try {
      const limitVal = monthlyLimit.trim() === "" ? undefined : Number(monthlyLimit);
      await updateMonthlyLimit({ organizationId, limitSGD: limitVal });
      toast.success("Monthly spend limit saved");
    } catch {
      toast.error("Failed to save limit");
    } finally {
      setSavingCap(false);
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <IconRefresh className="size-4 text-sky-500" />
          Auto-recharge
        </CardTitle>
        <CardDescription>
          Automatically buy credits when your balance drops low.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 flex-1">
        {!hasPaymentMethod && (
          <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Add a payment method to enable auto-recharge.
            </p>
            <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs gap-1" onClick={onAddCard}>
              <IconPlus className="size-3" />
              Add card
            </Button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Switch
            id="auto-recharge-toggle"
            checked={enabled && hasPaymentMethod}
            onCheckedChange={(val) => { if (hasPaymentMethod) setEnabled(val); }}
            disabled={!hasPaymentMethod}
          />
          <Label
            htmlFor="auto-recharge-toggle"
            className={hasPaymentMethod ? "cursor-pointer" : "cursor-not-allowed opacity-50"}
          >
            {enabled && hasPaymentMethod ? "Enabled" : "Disabled"}
          </Label>
        </div>

        {enabled && (
          <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Recharge when balance drops below</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="w-28 h-8 text-sm"
                />
                <div className="flex items-center gap-1 text-sm text-amber-600">
                  <IconCoins className="size-3.5" />
                  credits
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Recharge with</Label>
              <Select value={pack} onValueChange={(v) => setPack(v as PackId)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PACK_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {CREDIT_PACKS[id].label} — {CREDIT_PACKS[id].priceDisplay}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <Button size="sm" className="w-fit" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>

        {/* Monthly cap */}
        <div className="border-t pt-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <IconShield className="size-3.5 text-amber-500" />
            <span className="text-xs font-medium">Monthly spend cap</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Stop auto-recharge after this amount per month. Leave blank for no limit.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-medium">S$</span>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 100"
              value={monthlyLimit}
              onChange={(e) => setMonthlyLimit(e.target.value)}
              className="w-28 h-8 text-sm"
            />
            <Button size="sm" variant="outline" className="h-8" onClick={handleSaveCap} disabled={savingCap}>
              {savingCap ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Saved payment method ─────────────────────────────────────────────────────

function PaymentMethodSection({
  organizationId,
  paymentMethods,
  loading,
  onAdd,
  onRefresh,
}: {
  organizationId: Id<"organizations">;
  paymentMethods: PaymentMethod[];
  loading: boolean;
  onAdd: () => void;
  onRefresh: () => void;
}) {
  const setDefault = useAction(api.stripe.setDefaultPaymentMethod);
  const removePm = useAction(api.stripe.removePaymentMethod);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleSetDefault = async (pmId: string) => {
    setActionLoading(pmId);
    try {
      await setDefault({ organizationId, paymentMethodId: pmId });
      await onRefresh();
      toast.success("Default payment method updated");
    } catch {
      toast.error("Failed to update default payment method");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (pmId: string) => {
    setActionLoading(`remove-${pmId}`);
    try {
      await removePm({ organizationId, paymentMethodId: pmId });
      await onRefresh();
      toast.success("Payment method removed");
    } catch {
      toast.error("Failed to remove payment method");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <IconCreditCard className="size-4 text-teal-500" />
            Saved payment methods
          </CardTitle>
          <CardDescription className="mt-1">
            Cards are used for auto-recharge and future credit top-ups.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 h-8 text-xs gap-1.5" onClick={onAdd}>
          <IconPlus className="size-3.5" />
          Add card
        </Button>
      </CardHeader>
      <CardContent className="flex-1">
        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
        ) : paymentMethods.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <IconCreditCard className="size-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              No saved cards yet.
            </p>
            <Button size="sm" variant="outline" onClick={onAdd} className="gap-1.5">
              <IconPlus className="size-3.5" />
              Add payment method
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {paymentMethods.map((pm) => (
              <div
                key={pm.id}
                className="flex items-center justify-between rounded-lg border px-4 py-3 gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="capitalize text-sm font-medium shrink-0">{pm.brand}</span>
                  <span className="text-sm text-muted-foreground truncate">
                    •••• {pm.last4} · {pm.expMonth}/{String(pm.expYear).slice(-2)}
                  </span>
                  {pm.isDefault && (
                    <Badge variant="secondary" className="text-xs shrink-0">Default</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!pm.isDefault && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2"
                      disabled={actionLoading !== null}
                      onClick={() => handleSetDefault(pm.id)}
                    >
                      {actionLoading === pm.id ? "…" : "Set default"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7 w-7 p-0 text-destructive hover:text-destructive"
                    disabled={actionLoading !== null}
                    onClick={() => handleRemove(pm.id)}
                  >
                    <IconTrash className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Transaction history ──────────────────────────────────────────────────────

type MergedEntry =
  | { source: "stripe"; tx: Transaction }
  | { source: "clerk"; payment: ClerkPayment };

function TransactionHistorySection({
  transactions,
  clerkPayments,
}: {
  transactions: Transaction[] | undefined;
  clerkPayments: ClerkPayment[] | undefined;
}) {
  const isLoading = transactions === undefined && clerkPayments === undefined;

  const merged: MergedEntry[] = [
    ...(transactions ?? []).map((tx): MergedEntry => ({ source: "stripe", tx })),
    ...(clerkPayments ?? []).map((p): MergedEntry => ({ source: "clerk", payment: p })),
  ].sort((a, b) => {
    const dateA = a.source === "stripe" ? a.tx.createdAt : a.payment.paidAt;
    const dateB = b.source === "stripe" ? b.tx.createdAt : b.payment.paidAt;
    return dateB - dateA;
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <IconReceipt className="size-4 text-muted-foreground" />
          Recent transactions
        </CardTitle>
        <CardDescription>Credit top-ups, usage, and subscription payments</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
          </div>
        ) : merged.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No transactions yet.</p>
        ) : (
          <div className="flex flex-col divide-y">
            {merged.map((entry) => {
              if (entry.source === "stripe") {
                const tx = entry.tx;
                return (
                  <div key={`stripe-${tx._id}`} className="flex items-center justify-between py-3 gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant="outline" className={`text-xs shrink-0 ${txBadgeClass(tx.type)}`}>
                        {txTypeLabel(tx.type)}
                      </Badge>
                      <span className="text-sm truncate text-muted-foreground">{tx.description}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1">
                        <IconCoins className="size-3 text-amber-500 shrink-0" />
                        <span className={`text-sm font-semibold tabular-nums ${tx.amount > 0 ? "text-green-600" : "text-foreground"}`}>
                          {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground w-20 text-right hidden sm:block">
                        {new Date(tx.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>
                );
              }

              const p = entry.payment;
              return (
                <div key={`clerk-${p.paymentId}`} className="flex items-center justify-between py-3 gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant="outline" className="text-xs shrink-0 bg-violet-500/10 text-violet-600 border-violet-500/20">
                      Subscription
                    </Badge>
                    <span className="text-sm truncate text-muted-foreground">{p.planName}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {p.currencySymbol}{p.amountFormatted}
                    </span>
                    <span className="text-xs text-muted-foreground w-20 text-right hidden sm:block">
                      {new Date(p.paidAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Usage card ───────────────────────────────────────────────────────────────

function UsageCard({
  icon,
  label,
  pct,
  usedLabel,
  totalLabel,
}: {
  icon: React.ReactNode;
  label: string;
  pct: number;
  usedLabel: string;
  totalLabel: string;
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
        <Progress value={pct} className={`h-1.5 ${barColor}`} />
        <div className="flex items-baseline justify-between">
          <p className="text-xs text-muted-foreground">{usedLabel}</p>
          <p className="text-xs text-muted-foreground">{totalLabel}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function BillingSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 py-2">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-52 rounded-xl" />
    </div>
  );
}

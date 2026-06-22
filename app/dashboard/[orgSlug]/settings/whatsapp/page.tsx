"use client";

import { use, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { QRCodeSVG } from "qrcode.react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  IconCheck,
  IconCopy,
  IconRefresh,
  IconMessage2,
  IconQrcode,
  IconPlugConnectedX,
  IconChevronLeft,
  IconDeviceMobile,
  IconShieldCheck,
  IconExternalLink,
  IconClock,
  IconTrendingUp,
  IconThumbUp,
  IconInfoCircle,
} from "@tabler/icons-react";
import { toast } from "sonner";
import Link from "next/link";
import { PaywallGate } from "@/components/billing/paywall-gate";
import { MANAGED_WHATSAPP_NUMBER, WA_MANAGED_LINK } from "@/lib/botLinks";

const QR_TTL = 55; // seconds before we auto-fetch a fresh QR
const MANAGED_NUMBER = MANAGED_WHATSAPP_NUMBER; // shared LeadMighty managed bot

export default function WhatsAppSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const session = useQuery(
    api.whatsappSessions.getForOrg,
    org ? { organizationId: org._id } : "skip"
  );
  const activeTokens = useQuery(
    api.connectTokens.listActive,
    org ? { organizationId: org._id } : "skip"
  );

  const provision = useAction(api.whatsappSessions.provision);
  const connect = useAction(api.whatsappSessions.connect);
  const refreshQr = useAction(api.whatsappSessions.refreshQr);
  const disconnect = useAction(api.whatsappSessions.disconnect);
  const selectManaged = useAction(api.whatsappSessions.selectManaged);
  const setMode = useMutation(api.whatsappSessions.setMode);
  const generateToken = useMutation(api.connectTokens.generate);

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QR_TTL);
  const [busy, setBusy] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [changingNumber, setChangingNumber] = useState(false);
  const [tipsDismissed, setTipsDismissed] = useState(true);
  const [pendingMode, setPendingMode] = useState<"managed" | "byo" | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setTipsDismissed(localStorage.getItem("lb_wa_tips_dismissed") === "1");
    }
  }, []);

  function dismissTips() {
    setTipsDismissed(true);
    if (typeof window !== "undefined") localStorage.setItem("lb_wa_tips_dismissed", "1");
  }

  const hasSession = !!session;
  const connected = !!session?.connected;

  // Clear the QR once the session reports connected.
  useEffect(() => {
    if (connected) setQrCode(null);
  }, [connected]);

  // Countdown while a QR is showing.
  useEffect(() => {
    if (!qrCode || connected) return;
    setSecondsLeft(QR_TTL);
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [qrCode, connected]);

  // Auto-fetch a fresh QR when the countdown runs out (Wasender QRs are short-lived).
  useEffect(() => {
    if (secondsLeft > 0 || !qrCode || connected || !org) return;
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    (async () => {
      try {
        const { qrCode: fresh } = await refreshQr({ organizationId: org._id });
        if (fresh) setQrCode(fresh);
      } catch {
        /* keep the old code; user can refresh manually */
      } finally {
        setSecondsLeft(QR_TTL);
        refreshingRef.current = false;
      }
    })();
  }, [secondsLeft, qrCode, connected, org, refreshQr]);

  if (!org) return <Skeleton className="h-64 rounded-xl mx-4 lg:mx-6 mt-4" />;

  const status = session?.status ?? null;

  async function startConnection(force: boolean) {
    if (!org) return;
    // A phone number is only needed to create/replace the underlying session.
    const phone = phoneNumber.trim();
    if ((!hasSession || force) && !phone) {
      toast.error("Enter the WhatsApp number to use as your bot");
      return;
    }
    setBusy(true);
    setQrCode(null);
    try {
      if (!hasSession || force) {
        await provision({ organizationId: org._id, phoneNumber: phone, name: org.name, forceNew: force });
      }
      const { qrCode } = await connect({ organizationId: org._id });
      if (qrCode) {
        setQrCode(qrCode);
        setChangingNumber(false);
      } else {
        toast.message("Connecting… the QR will appear shortly.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start connection");
    } finally {
      setBusy(false);
    }
  }

  async function handleManualRefresh() {
    if (!org) return;
    setBusy(true);
    try {
      const { qrCode } = await refreshQr({ organizationId: org._id });
      if (qrCode) {
        setQrCode(qrCode);
        setSecondsLeft(QR_TTL);
      } else {
        toast.message("No QR available — the session may already be connected.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to refresh QR");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!org) return;
    setBusy(true);
    try {
      await disconnect({ organizationId: org._id });
      setQrCode(null);
      toast.success("WhatsApp disconnected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateToken() {
    if (!org) return;
    setGenerating(true);
    try {
      await generateToken({ organizationId: org._id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate token");
    } finally {
      setGenerating(false);
    }
  }

  function restoreTips() {
    setTipsDismissed(false);
    if (typeof window !== "undefined") localStorage.removeItem("lb_wa_tips_dismissed");
  }

  async function confirmSwitch() {
    if (!org || !pendingMode) return;
    const target = pendingMode;
    setPendingMode(null);
    setBusy(true);
    try {
      if (target === "managed") {
        await selectManaged({ organizationId: org._id });
        setQrCode(null);
        toast.success("Switched to LeadMighty's agent");
      } else {
        await setMode({ organizationId: org._id, mode: "byo" });
        toast.success("Switched to your own number");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to switch");
    } finally {
      setBusy(false);
    }
  }

  const mode = org.whatsappMode ?? null;
  const managed = mode === "managed";
  const linkingEnabled = managed || connected;

  const activeToken = activeTokens?.[0]?.token ?? null;
  const tokenExpiresAt = activeTokens?.[0]?.expiresAt ?? null;

  const statusBadge = managed ? (
    <Badge className="bg-green-600 hover:bg-green-600">Managed bot</Badge>
  ) : connected ? (
    <Badge className="bg-green-600 hover:bg-green-600">Connected</Badge>
  ) : status === "need_scan" ? (
    <Badge variant="secondary">Awaiting scan</Badge>
  ) : status === "initializing" ? (
    <Badge variant="secondary">Connecting…</Badge>
  ) : (
    <Badge variant="outline">Not connected</Badge>
  );

  const showPhoneInput = !hasSession || changingNumber;

  return (
    <PaywallGate organizationId={org._id}>
      <div className="w-full px-4 lg:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <Link
            href={`/dashboard/${orgSlug}/settings/channels`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <IconChevronLeft className="size-4" />
            Channels
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-semibold">WhatsApp</h2>
            {statusBadge}
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Connect a WhatsApp number as your bot, then link your group chats.
          </p>
        </div>

        {/* ── Delivery method selector ── */}
        <div className="mb-6 max-w-3xl">
          <p className="text-sm font-medium mb-2">Delivery method</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeOption
              active={managed}
              title="LeadMighty's agent"
              badge="Recommended"
              desc={`Use our shared number (${MANAGED_NUMBER}). No setup.`}
              icon={<IconShieldCheck className="size-5 text-green-600" />}
              onSelect={() => setPendingMode("managed")}
              disabled={busy || managed}
            />
            <ModeOption
              active={mode === "byo"}
              title="Your own agent"
              desc="Scan a QR to use your own number."
              icon={<IconDeviceMobile className="size-5" />}
              onSelect={() => setPendingMode("byo")}
              disabled={busy || mode === "byo"}
            />
          </div>
          {managed && (
            <p className="text-xs text-muted-foreground mt-2">
              Switching to your own number will disconnect the managed agent for new messages.
            </p>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-5">
          {/* ── Managed bot card ── */}
          {managed && (
            <Card className="xl:col-span-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <IconShieldCheck className="size-4 text-green-600" />
                  Managed bot
                </CardTitle>
                <CardDescription>
                  Served by{" "}
                  <span className="text-foreground font-medium">{MANAGED_NUMBER}</span>. Scan to save
                  the bot, add it to your group, then connect with a token.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
                <div className="rounded-xl border bg-white p-3 shadow-sm shrink-0">
                  <QRCodeSVG value={WA_MANAGED_LINK} size={150} marginSize={1} />
                </div>
                <div className="flex flex-col gap-3 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="size-2 rounded-full bg-green-600" />
                    Active — no setup needed.
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Scan the QR with your phone, or open the chat directly:
                  </p>
                  <a href={WA_MANAGED_LINK} target="_blank" rel="noopener noreferrer" className="w-fit">
                    <Button variant="outline" size="sm">
                      <IconExternalLink className="size-4" />
                      Open WhatsApp chat
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Connection card (bring your own number) ── */}
          {mode === "byo" && (
          <Card className="xl:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <IconDeviceMobile className="size-4" />
                Agent number
              </CardTitle>
              <CardDescription>
                {connected
                  ? `Connected${session?.phoneNumber ? ` as ${session.phoneNumber}` : ""}. This number acts as your Lead Mighty agent — keep the phone online.`
                  : "Open WhatsApp on the phone you want as your agent → Linked devices → Link a device, then scan the QR below."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {connected ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleDisconnect} disabled={busy}>
                    <IconPlugConnectedX className="size-4" />
                    Disconnect
                  </Button>
                </div>
              ) : (
                <>
                  {qrCode && (
                    <div className="flex flex-col items-center gap-3 rounded-xl border bg-muted/30 py-6">
                      <div className="rounded-xl border bg-white p-4 shadow-sm">
                        <QRCodeSVG value={qrCode} size={240} marginSize={1} />
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <div className="h-1.5 w-48 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-green-600 transition-[width] duration-1000 ease-linear"
                            style={{ width: `${(secondsLeft / QR_TTL) * 100}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Refreshes automatically in {secondsLeft}s
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={handleManualRefresh} disabled={busy}>
                        <IconRefresh className={`size-4 ${busy ? "animate-spin" : ""}`} />
                        Refresh now
                      </Button>
                    </div>
                  )}

                  {showPhoneInput && (
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Agent WhatsApp number
                      </label>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <PhoneInput
                          value={phoneNumber}
                          onChange={setPhoneNumber}
                          disabled={busy}
                          className="sm:max-w-xs flex-1"
                        />
                        <Button onClick={() => startConnection(changingNumber)} disabled={busy}>
                          <IconQrcode className="size-4" />
                          {busy ? "Starting…" : qrCode ? "New QR" : "Generate QR"}
                        </Button>
                        {changingNumber && (
                          <Button variant="ghost" onClick={() => setChangingNumber(false)} disabled={busy}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {hasSession && !changingNumber && (
                    <div className="flex flex-wrap items-center gap-2">
                      {!qrCode && (
                        <Button onClick={() => startConnection(false)} disabled={busy}>
                          <IconQrcode className="size-4" />
                          {busy ? "Starting…" : "Generate QR code"}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setChangingNumber(true)} disabled={busy}>
                        Use a different number
                      </Button>
                    </div>
                  )}

                  {!tipsDismissed ? (
                    <AccountHealthTips onDismiss={dismissTips} />
                  ) : (
                    <button
                      onClick={restoreTips}
                      className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <IconInfoCircle className="size-3.5" />
                      Show account health tips
                    </button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          )}

          {/* ── Connect a group card ── */}
          {mode && (
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Connect a group</CardTitle>
              <CardDescription>
                Send a one-time token in your WhatsApp group to link it to this organization.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ol className="text-sm text-muted-foreground flex flex-col gap-2 list-decimal list-inside">
                {managed ? (
                  <li>
                    Add <span className="text-foreground font-medium">{MANAGED_NUMBER}</span> to your
                    WhatsApp group.
                  </li>
                ) : (
                  <>
                    <li>Make sure your agnet number is connected.</li>
                    <li>Add that number to your WhatsApp group.</li>
                  </>
                )}
                <li>Generate a token and send it in the group.</li>
              </ol>

              <Button
                variant="outline"
                className="w-fit"
                onClick={handleGenerateToken}
                disabled={generating || !linkingEnabled}
              >
                <IconRefresh className={`size-4 ${generating ? "animate-spin" : ""}`} />
                {generating ? "Generating…" : "Generate connect token"}
              </Button>
              {!linkingEnabled && (
                <p className="text-xs text-muted-foreground">
                  Connect your agent number first to enable group linking.
                </p>
              )}

              {activeToken && (
                <div className="flex items-center gap-2">
                  <Input readOnly value={`/connect ${activeToken}`} className="font-mono text-sm" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={async () => {
                      await navigator.clipboard.writeText(`/connect ${activeToken}`);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2000);
                      toast.success("Command copied");
                    }}
                  >
                    {copiedToken ? (
                      <IconCheck className="size-4 text-green-500" />
                    ) : (
                      <IconCopy className="size-4" />
                    )}
                  </Button>
                </div>
              )}
              {activeToken && tokenExpiresAt && (
                <p className="text-xs text-muted-foreground">
                  Token expires {new Date(tokenExpiresAt).toLocaleTimeString()}.
                </p>
              )}

              <Link href={`/dashboard/${orgSlug}/groups`} className="mt-1">
                <Button variant="ghost" size="sm" className="px-0 text-primary">
                  <IconMessage2 className="size-4" />
                  Manage connected groups
                </Button>
              </Link>
            </CardContent>
          </Card>
          )}
        </div>
      </div>

      {/* Confirm switch */}
      <Dialog open={!!pendingMode} onOpenChange={(o) => { if (!o) setPendingMode(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingMode === "managed" ? "Switch to LeadMighty's agent?" : "Switch to your own agent?"}
            </DialogTitle>
            <DialogDescription>
              {pendingMode === "managed"
                ? "New messages will be handled by the shared LeadMighty number. Your own number will be disconnected, and groups linked to it stay visible but won't be processed until you switch back."
                : "New messages will be handled by your own scanned number. Groups linked to the managed agent stay visible but won't be processed until you switch back."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPendingMode(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={confirmSwitch} disabled={busy}>
              {busy ? "Switching…" : "Switch"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PaywallGate>
  );
}

function ModeOption({
  active,
  title,
  desc,
  icon,
  badge,
  onSelect,
  disabled,
}: {
  active: boolean;
  title: string;
  desc: string;
  icon: React.ReactNode;
  badge?: string;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`text-left rounded-xl border p-4 flex flex-col gap-2 transition-all disabled:cursor-default ${
        active
          ? "border-green-600 ring-1 ring-green-600/30 bg-green-600/5"
          : "hover:border-primary/50 hover:shadow-sm"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-muted/60 p-2">{icon}</div>
          <span className="font-medium text-sm">{title}</span>
        </div>
        {active ? (
          <Badge className="bg-green-600 hover:bg-green-600">
            <IconCheck className="size-3" /> Active
          </Badge>
        ) : badge ? (
          <Badge variant="secondary">{badge}</Badge>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </button>
  );
}

const HEALTH_TIPS: { icon: React.ReactNode; text: string }[] = [
  { icon: <IconMessage2 className="size-4 text-green-600" />, text: "Best for replies and existing contacts." },
  { icon: <IconClock className="size-4 text-green-600" />, text: "Warm up new numbers ~3 days before linking." },
  { icon: <IconTrendingUp className="size-4 text-green-600" />, text: "Start small — no mass blasts to strangers." },
  { icon: <IconThumbUp className="size-4 text-green-600" />, text: "Message opt-ins; vary wording; offer opt-out." },
];

function AccountHealthTips({ onDismiss }: { onDismiss: () => void }) {
  const [closing, setClosing] = useState(false);

  function handleDismiss() {
    setClosing(true);
    setTimeout(onDismiss, 250); // let the fade play
  }

  return (
    <div
      className={`rounded-xl border bg-muted/30 p-4 flex flex-col gap-3 transition-opacity duration-300 ${
        closing ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconShieldCheck className="size-4 text-green-600" />
          <p className="text-sm font-medium">Keep your account healthy</p>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleDismiss}>
          Got it
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {HEALTH_TIPS.map((tip, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
            {tip.icon}
            <span>{tip.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

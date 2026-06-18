"use client";

import { use, useCallback, useEffect, useState } from "react";
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
  IconMessage2,
  IconChevronLeft,
  IconBrandLine,
  IconShieldCheck,
  IconExternalLink,
  IconCheck,
  IconCopy,
  IconKey,
} from "@tabler/icons-react";
import { toast } from "sonner";
import Link from "next/link";
import { PaywallGate } from "@/components/billing/paywall-gate";
import { LINE_ADD_URL } from "@/lib/botLinks";

export default function LineSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const config = useQuery(
    api.lineChannels.getConfig,
    org ? { organizationId: org._id } : "skip"
  );

  const saveByok = useAction(api.lineChannels.saveByok);
  const setMode = useMutation(api.lineChannels.setMode);
  const ensureRouteToken = useMutation(api.lineChannels.ensureRouteToken);
  const getStatus = useAction(api.lineChannels.getStatus);

  const [pendingMode, setPendingMode] = useState<"managed" | "byok" | null>(null);
  // Which card the user is viewing/configuring (the ring). Defaults to the live mode.
  const [view, setView] = useState<"managed" | "byok" | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [channelSecret, setChannelSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<{
    connected: boolean;
    botName: string | null;
    webhookActive: boolean;
    webhookMatches: boolean;
  } | null>(null);
  const [checking, setChecking] = useState(false);

  const mode = config?.mode; // the live (server) mode
  const effectiveView = view ?? mode; // what's selected in the UI
  const showByok = effectiveView === "byok";
  const hasByok = !!config?.hasByok;

  const refreshStatus = useCallback(async () => {
    if (!org) return;
    setChecking(true);
    try {
      const s = await getStatus({ organizationId: org._id });
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }, [org, getStatus]);

  // Generate the webhook route token as soon as the BYOK form is shown.
  useEffect(() => {
    if (org && config && showByok && !config.webhookUrl) {
      ensureRouteToken({ organizationId: org._id }).catch(() => {});
    }
  }, [org, config, showByok, ensureRouteToken]);

  // Live-check the stored credentials against LINE when viewing the BYOK config.
  useEffect(() => {
    if (org && showByok && hasByok) refreshStatus();
  }, [org, showByok, hasByok, refreshStatus]);

  if (!org || !config) return <Skeleton className="h-64 rounded-xl mx-4 lg:mx-6 mt-4" />;

  const managed = effectiveView === "managed";

  function selectMode(target: "managed" | "byok") {
    setView(target); // toggle the ring immediately
    if (target === mode) return; // already live — just viewing
    // Switching the live mode requires a confirm — unless BYOK isn't set up yet,
    // in which case we just reveal the setup form (the ring already moved).
    if (target === "byok" && !config!.hasByok) return;
    setPendingMode(target);
  }

  function cancelSwitch() {
    setPendingMode(null);
    setView(null); // revert the ring to the live mode
  }

  async function confirmSwitch() {
    if (!org || !pendingMode) return;
    const target = pendingMode;
    setPendingMode(null);
    setBusy(true);
    try {
      await setMode({ organizationId: org._id, mode: target });
      setView(target);
      toast.success(target === "managed" ? "Switched to LeadMighty's bot" : "Switched to your own bot");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to switch");
      setView(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveByok() {
    if (!org) return;
    if (!accessToken.trim() || !channelSecret.trim()) {
      toast.error("Enter both the channel access token and channel secret");
      return;
    }
    setBusy(true);
    try {
      const res = await saveByok({
        organizationId: org._id,
        accessToken: accessToken.trim(),
        channelSecret: channelSecret.trim(),
      });
      setAccessToken("");
      setChannelSecret("");
      setView("byok");
      toast.success(`Connected as ${res.botName}`);
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save credentials");
    } finally {
      setBusy(false);
    }
  }

  async function copyWebhook() {
    if (!config?.webhookUrl) return;
    await navigator.clipboard.writeText(config.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Webhook URL copied");
  }

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
            <h2 className="text-xl font-semibold">LINE</h2>
            <Badge className="bg-green-600 hover:bg-green-600">
              {managed ? "Managed bot" : "Your own bot"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Use the shared LeadMighty LINE bot, or connect your own LINE channel.
          </p>
        </div>

        {/* Delivery method selector */}
        <div className="mb-6 max-w-3xl">
          <p className="text-sm font-medium mb-2">Delivery method</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeOption
              selected={effectiveView === "managed"}
              live={mode === "managed"}
              title="LeadMighty's bot"
              badge="Recommended"
              desc="Use our shared LINE bot. No setup — just add it to your group."
              icon={<IconShieldCheck className="size-5 text-green-600" />}
              onSelect={() => selectMode("managed")}
              disabled={busy}
            />
            <ModeOption
              selected={effectiveView === "byok"}
              live={mode === "byok"}
              title="Your own bot"
              desc="Connect your own LINE channel with its access token + secret."
              icon={<IconKey className="size-5" />}
              onSelect={() => selectMode("byok")}
              disabled={busy}
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 max-w-4xl">
          {/* Managed card */}
          {effectiveView === "managed" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <IconShieldCheck className="size-4 text-green-600" />
                  Managed bot
                </CardTitle>
                <CardDescription>
                  {LINE_ADD_URL
                    ? "Scan to add the Line Buddy bot as a friend, then add it to your group."
                    : "The shared bot is managed by Line Buddy and always available."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
                {LINE_ADD_URL && (
                  <div className="rounded-xl border bg-white p-3 shadow-sm shrink-0">
                    <QRCodeSVG value={LINE_ADD_URL} size={150} marginSize={1} />
                  </div>
                )}
                <div className="flex flex-col gap-3 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="size-2 rounded-full bg-green-600" />
                    Active — no setup needed.
                  </div>
                  {LINE_ADD_URL && (
                    <a href={LINE_ADD_URL} target="_blank" rel="noopener noreferrer" className="w-fit">
                      <Button variant="outline" size="sm">
                        <IconExternalLink className="size-4" />
                        Add bot on LINE
                      </Button>
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* BYOK card */}
          {showByok && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <IconKey className="size-4" />
                  Your LINE channel
                </CardTitle>
                <CardDescription>
                  From your LINE Developers console (Messaging API channel): paste the long-lived
                  channel access token and channel secret, then set the webhook URL below.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {hasByok && (
                  <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3">
                    {checking && !status ? (
                      <span className="text-sm text-muted-foreground">Checking connection with LINE…</span>
                    ) : status?.connected ? (
                      <>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="size-2 rounded-full bg-green-600" />
                          Connected as <span className="font-medium">{status.botName}</span>
                          {mode === "byok" && <Badge className="bg-green-600 hover:bg-green-600 ml-1">Active</Badge>}
                        </div>
                        {!(status.webhookActive && status.webhookMatches) && (
                          <span className="text-xs text-amber-600 dark:text-amber-500">
                            ⚠ Webhook not detected yet — paste the URL above into your LINE channel and
                            enable &ldquo;Use webhook&rdquo;.
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="flex items-center gap-2 text-sm text-destructive">
                        <span className="size-2 rounded-full bg-destructive" />
                        Not connected — the saved access token was rejected by LINE. Re-enter it below.
                      </span>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Webhook URL — paste into LINE console → Messaging API → Webhook URL, then turn
                    on &ldquo;Use webhook&rdquo;.
                  </label>
                  {config.webhookUrl ? (
                    <div className="flex items-center gap-2">
                      <Input readOnly value={config.webhookUrl} className="font-mono text-xs bg-muted" />
                      <Button variant="outline" size="icon" onClick={copyWebhook}>
                        {copied ? <IconCheck className="size-4 text-green-500" /> : <IconCopy className="size-4" />}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Generating your webhook URL…</p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Channel access token</label>
                  <Input
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder={config.hasByok ? "•••••••• (leave to keep / re-enter to update)" : "Long-lived channel access token"}
                    type="password"
                  />
                  <label className="text-xs font-medium text-muted-foreground mt-1">Channel secret</label>
                  <Input
                    value={channelSecret}
                    onChange={(e) => setChannelSecret(e.target.value)}
                    placeholder={config.hasByok ? "•••••••• (re-enter to update)" : "Channel secret"}
                    type="password"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={handleSaveByok} disabled={busy}>
                    {busy ? "Saving…" : config.hasByok ? "Update & use my bot" : "Connect my bot"}
                  </Button>
                  {mode !== "byok" && (
                    <Button variant="ghost" onClick={() => setView(null)} disabled={busy}>
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Connect a group */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <IconBrandLine className="size-4 text-[#06C755]" />
                Connect a group
              </CardTitle>
              <CardDescription>Add the bot to your LINE group, then link it with a token.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ol className="text-sm text-muted-foreground flex flex-col gap-2 list-decimal list-inside">
                <li>Add the {managed ? "Line Buddy" : "your"} bot to the LINE group.</li>
                <li>Open Group Chats and generate a connect token.</li>
                <li>Send the token as a message in the LINE group.</li>
              </ol>
              <Link href={`/dashboard/${orgSlug}/groups`} className="w-fit">
                <Button variant="outline">
                  <IconMessage2 className="size-4" />
                  Go to Group Chats
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirm switch */}
      <Dialog open={!!pendingMode} onOpenChange={(o) => { if (!o) cancelSwitch(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingMode === "managed" ? "Switch to LeadMighty's bot?" : "Switch to your own bot?"}
            </DialogTitle>
            <DialogDescription>
              {pendingMode === "managed"
                ? "New messages will be handled by the shared LINE bot. Groups linked to your own bot stay visible but won't be processed until you switch back."
                : "New messages will be handled by your own LINE channel. Groups linked to the managed bot stay visible but won't be processed until you switch back."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={cancelSwitch} disabled={busy}>
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
  selected,
  live,
  title,
  desc,
  icon,
  badge,
  onSelect,
  disabled,
}: {
  selected: boolean; // outlined / being viewed
  live: boolean;     // the actually-active processing mode
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
      className={`text-left rounded-xl border p-4 flex flex-col gap-2 transition-all disabled:opacity-100 ${
        selected ? "border-green-600 ring-1 ring-green-600/30 bg-green-600/5" : "hover:border-primary/50 hover:shadow-sm"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-muted/60 p-2">{icon}</div>
          <span className="font-medium text-sm">{title}</span>
        </div>
        {live ? (
          <Badge className="bg-green-600 hover:bg-green-600">
            <IconCheck className="size-3" /> Active
          </Badge>
        ) : selected ? (
          <Badge variant="secondary">Selected</Badge>
        ) : badge ? (
          <Badge variant="secondary">{badge}</Badge>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </button>
  );
}

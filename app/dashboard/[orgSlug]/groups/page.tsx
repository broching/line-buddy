"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  IconPlus,
  IconMessage2,
  IconRefresh,
  IconCopy,
  IconCheck,
  IconClock,
  IconSearch,
  IconUsers,
  IconFolderOpen,
  IconChevronDown,
  IconDoorExit,
  IconArchive,
  IconBrandWhatsapp,
  IconBrandLine,
} from "@tabler/icons-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import Link from "next/link";
import { useEffect } from "react";
import { PaywallGate } from "@/components/billing/paywall-gate";
import { MANAGED_WHATSAPP_NUMBER } from "@/lib/botLinks";

type GroupWithStats = {
  _id: string;
  displayName: string;
  pictureUrl?: string;
  lineGroupId: string;
  channel?: "line" | "whatsapp";
  lineAgent?: "managed" | "byok";
  whatsappAgent?: "managed" | "byo";
  isActive: boolean;
  memberCount?: number;
  activeProjectCount: number;
  totalProjectCount: number;
  lastMessageAt: number | null;
  lastMessagePreview: string | null;
  lastMessageUserId: string | null;
};

export default function GroupsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const groups = useQuery(
    api.groupChats.listWithStats,
    org ? { organizationId: org._id } : "skip"
  ) as GroupWithStats[] | undefined;

  const leaveGroup = useAction(api.groupChats.leaveGroup);

  const [showConnect, setShowConnect] = useState(false);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<GroupWithStats | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [lineOpen, setLineOpen] = useState(true);
  const [waOpen, setWaOpen] = useState(true);

  if (!org || !groups) return <GroupsSkeleton />;

  const sorted = [...groups].sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));

  // When searching: show all (active + archived) matching results flat
  // When not searching: split into per-channel sections
  const isSearching = search.trim() !== "";
  const matchesSearch = (g: GroupWithStats) =>
    g.displayName.toLowerCase().includes(search.toLowerCase());

  const activeGroups   = sorted.filter((g) =>  g.isActive);
  const archivedGroups = sorted.filter((g) => !g.isActive);

  const searchResults = isSearching ? sorted.filter(matchesSearch) : [];

  const activeCount   = activeGroups.length;
  const archivedCount = archivedGroups.length;

  // Per-channel splits (active only; archived stays in the shared section below)
  const activeLine = activeGroups.filter((g) => (g.channel ?? "line") === "line");
  const lineManaged = activeLine.filter((g) => (g.lineAgent ?? "managed") === "managed");
  const lineByok = activeLine.filter((g) => (g.lineAgent ?? "managed") === "byok");
  const activeWa = activeGroups.filter((g) => g.channel === "whatsapp");
  const waManaged = activeWa.filter((g) => (g.whatsappAgent ?? "byo") === "managed");
  const waByo = activeWa.filter((g) => (g.whatsappAgent ?? "byo") === "byo");

  async function handleLeave() {
    if (!leaveTarget || !org) return;
    setLeaving(true);
    try {
      await leaveGroup({
        organizationId: org._id as Id<"organizations">,
        groupChatId: leaveTarget._id as Id<"groupChats">,
      });
      toast.success(`Left "${leaveTarget.displayName}" — archived.`);
      setLeaveTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to leave group");
    } finally {
      setLeaving(false);
    }
  }

  return (
    <PaywallGate organizationId={org._id}>
    <div className="flex flex-col gap-0 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h2 className="text-base font-semibold">Group Chats</h2>
          <p className="text-xs text-muted-foreground">
            {activeCount} active group{activeCount !== 1 ? "s" : ""}
            {archivedCount > 0 && ` · ${archivedCount} archived`}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowConnect(true)}>
          <IconPlus className="size-3.5" />
          Connect group
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b">
        <div className="relative">
          <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm bg-muted/40 border-0 focus-visible:ring-1"
            placeholder="Search groups…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          /* ── Search results (active + archived flat) ── */
          searchResults.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center px-6">
              <IconSearch className="size-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No groups matching &ldquo;{search}&rdquo;</p>
            </div>
          ) : (
            <div className="divide-y">
              {searchResults.map((g) => (
                <GroupRow
                  key={g._id}
                  group={g}
                  orgSlug={orgSlug}
                  onLeave={() => setLeaveTarget(g)}
                />
              ))}
            </div>
          )
        ) : groups.length === 0 ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
            <IconMessage2 className="size-10 text-muted-foreground/30" />
            <p className="font-medium text-sm">No groups connected yet</p>
            <p className="text-xs text-muted-foreground">
              Add a bot to a group, then click &ldquo;Connect group&rdquo;
            </p>
            <Button size="sm" variant="outline" onClick={() => setShowConnect(true)}>
              <IconPlus className="size-3.5" />
              Connect first group
            </Button>
          </div>
        ) : (
          /* ── Normal view: per-channel sections + archived ── */
          <>
            {/* LINE */}
            <ChannelSection
              icon={<IconBrandLine className="size-4 text-[#06C755]" />}
              title="LINE"
              count={activeLine.length}
              open={lineOpen}
              onToggle={() => setLineOpen((v) => !v)}
            >
              <Tabs defaultValue="managed" className="gap-0">
                <TabsList className="mx-3 mt-2">
                  <TabsTrigger value="managed">LeadMighty&apos;s bot ({lineManaged.length})</TabsTrigger>
                  <TabsTrigger value="byok">Your own bot ({lineByok.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="managed">
                  {lineManaged.length === 0 ? (
                    <EmptyHint text="No groups on the managed bot yet" />
                  ) : (
                    <div className="divide-y">
                      {lineManaged.map((g) => (
                        <GroupRow key={g._id} group={g} orgSlug={orgSlug} onLeave={() => setLeaveTarget(g)} />
                      ))}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="byok">
                  {lineByok.length === 0 ? (
                    <EmptyHint text="No groups on your own bot yet" />
                  ) : (
                    <div className="divide-y">
                      {lineByok.map((g) => (
                        <GroupRow key={g._id} group={g} orgSlug={orgSlug} onLeave={() => setLeaveTarget(g)} />
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </ChannelSection>

            {/* WhatsApp */}
            <ChannelSection
              icon={<IconBrandWhatsapp className="size-4 text-green-600" />}
              title="WhatsApp"
              count={activeWa.length}
              open={waOpen}
              onToggle={() => setWaOpen((v) => !v)}
            >
              <Tabs defaultValue="managed" className="gap-0">
                <TabsList className="mx-3 mt-2">
                  <TabsTrigger value="managed">LeadMighty&apos;s agent ({waManaged.length})</TabsTrigger>
                  <TabsTrigger value="byo">Your own agent ({waByo.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="managed">
                  {waManaged.length === 0 ? (
                    <EmptyHint text="No groups on the managed bot yet" />
                  ) : (
                    <div className="divide-y">
                      {waManaged.map((g) => (
                        <GroupRow key={g._id} group={g} orgSlug={orgSlug} onLeave={() => setLeaveTarget(g)} />
                      ))}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="byo">
                  {waByo.length === 0 ? (
                    <EmptyHint text="No groups on your own number yet" />
                  ) : (
                    <div className="divide-y">
                      {waByo.map((g) => (
                        <GroupRow key={g._id} group={g} orgSlug={orgSlug} onLeave={() => setLeaveTarget(g)} />
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </ChannelSection>

            {/* Archived section */}
            {archivedCount > 0 && (
              <>
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors border-t"
                >
                  <IconArchive className="size-3.5" />
                  Archived ({archivedCount})
                  <IconChevronDown
                    className={`size-3.5 ml-auto transition-transform ${showArchived ? "rotate-180" : ""}`}
                  />
                </button>

                {showArchived && (
                  <div className="divide-y">
                    {archivedGroups.map((g) => (
                      <GroupRow
                        key={g._id}
                        group={g}
                        orgSlug={orgSlug}
                        onLeave={() => {}}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Connect modal */}
      <ConnectGroupModal
        open={showConnect}
        onClose={() => setShowConnect(false)}
        orgId={org._id}
        whatsappMode={org.whatsappMode}
      />

      {/* Leave confirmation dialog */}
      <Dialog open={!!leaveTarget} onOpenChange={(o) => { if (!o) setLeaveTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Leave group chat?</DialogTitle>
            <DialogDescription>
              The bot will stop monitoring <strong>{leaveTarget?.displayName}</strong>
              {leaveTarget?.channel === "whatsapp" ? "" : " on LINE"}. Past messages will be
              preserved in the archive.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setLeaveTarget(null)} disabled={leaving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleLeave} disabled={leaving}>
              {leaving ? "Leaving…" : "Leave group"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </PaywallGate>
  );
}

function formatTime(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function GroupRow({
  group,
  orgSlug,
  onLeave,
}: {
  group: GroupWithStats;
  orgSlug: string;
  onLeave: () => void;
}) {
  const initials = group.displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className={`group/row relative flex items-center ${!group.isActive ? "opacity-60" : ""}`}>
      {/* Navigable content area */}
      <Link
        href={`/dashboard/${orgSlug}/groups/${group._id}`}
        className="flex flex-1 items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors min-w-0"
      >
        {/* Avatar */}
        <div className="relative shrink-0">
          {group.pictureUrl ? (
            <img
              src={group.pictureUrl}
              alt={group.displayName}
              className="size-12 rounded-full object-cover"
            />
          ) : (
            <div className="size-12 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-sm">
              {initials || <IconMessage2 className="size-5" />}
            </div>
          )}
          {!group.isActive && (
            <div className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-muted-foreground/50 border-2 border-background" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-8">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {group.channel === "whatsapp" ? (
                <IconBrandWhatsapp className="size-3.5 shrink-0 text-green-600" />
              ) : (
                <IconBrandLine className="size-3.5 shrink-0 text-[#06C755]" />
              )}
              <p className="font-semibold text-sm truncate">{group.displayName}</p>
            </div>
            <span className="text-[11px] text-muted-foreground shrink-0">
              {formatTime(group.lastMessageAt)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground truncate flex-1">
              {group.lastMessagePreview ?? (
                <span className="italic">No messages yet</span>
              )}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {group.memberCount != null && group.memberCount > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <IconUsers className="size-2.5" />
                  {group.memberCount}
                </span>
              )}
              {group.totalProjectCount > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <IconFolderOpen className="size-2.5" />
                  {group.activeProjectCount}/{group.totalProjectCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>

      {/* Leave button — only active groups, appears on hover */}
      {group.isActive && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLeave();
          }}
          title="Leave group"
          className="absolute right-3 p-1.5 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <IconDoorExit className="size-4" />
        </button>
      )}
    </div>
  );
}

// ─── Connect Group Modal ───────────────────────────────────────────────────────

function ConnectGroupModal({
  open,
  onClose,
  orgId,
  whatsappMode,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  whatsappMode?: "managed" | "byo";
}) {
  const generateToken = useMutation(api.connectTokens.generate);
  const activeTokens = useQuery(api.connectTokens.listActive, {
    organizationId: orgId as any,
  });

  const [channel, setChannel] = useState<"line" | "whatsapp">("line");
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");

  const isWa = channel === "whatsapp";
  const addBotStep = isWa
    ? whatsappMode === "managed"
      ? `Add the LeadMighty bot (${MANAGED_WHATSAPP_NUMBER}) to your WhatsApp group`
      : "Add your connected WhatsApp number to the group"
    : "Add your LINE bot to the group chat";

  useEffect(() => {
    if (activeTokens && activeTokens.length > 0) {
      const t = activeTokens[0];
      setToken(t.token);
      setExpiresAt(t.expiresAt);
    }
  }, [activeTokens]);

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setTimeLeft("Expired");
        setToken(null);
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, "0")}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const newToken = await generateToken({ organizationId: orgId as any });
      setToken(newToken);
      setExpiresAt(Date.now() + 10 * 60 * 1000);
      setCopied(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to generate token");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!token) return;
    await navigator.clipboard.writeText(`/connect ${token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isExpired = expiresAt > 0 && Date.now() > expiresAt;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect a group</DialogTitle>
          <DialogDescription>
            Generate a token, add the bot to your group, then send the command in the chat.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-2">
          {/* Channel toggle */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button
              onClick={() => setChannel("line")}
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${
                !isWa ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <IconBrandLine className="size-4 text-[#06C755]" />
              LINE
            </button>
            <button
              onClick={() => setChannel("whatsapp")}
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${
                isWa ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <IconBrandWhatsapp className="size-4 text-green-600" />
              WhatsApp
            </button>
          </div>

          <ol className="text-sm text-muted-foreground flex flex-col gap-2 list-decimal list-inside">
            <li>{addBotStep}</li>
            <li>Generate a connect token below</li>
            <li>Send the command in the {isWa ? "WhatsApp" : "LINE"} group</li>
          </ol>

          {token && !isExpired ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border bg-muted/40 p-4 flex flex-col items-center gap-2">
                <p className="text-2xl font-mono font-bold tracking-widest">{token}</p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <IconClock className="size-3.5" />
                  <span>Expires in {timeLeft}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleCopy}>
                  {copied
                    ? <><IconCheck className="size-4 text-green-500" /> Copied!</>
                    : <><IconCopy className="size-4" /> Copy command</>
                  }
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleGenerate}
                  disabled={generating}
                  title="Generate new token"
                >
                  <IconRefresh className={`size-4 ${generating ? "animate-spin" : ""}`} />
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                The command <code className="bg-muted px-1 py-0.5 rounded">/connect {token}</code> will be copied to clipboard.
                Paste it in your {isWa ? "WhatsApp" : "LINE"} group.
              </p>
            </div>
          ) : (
            <Button onClick={handleGenerate} disabled={generating} className="w-full">
              {generating ? "Generating…" : isExpired ? "Generate new token" : "Generate connect token"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChannelSection({
  icon,
  title,
  count,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium hover:bg-muted/30 transition-colors"
      >
        {icon}
        {title}
        <span className="text-xs text-muted-foreground">({count})</span>
        <IconChevronDown
          className={`size-4 ml-auto text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="px-4 py-6 text-xs text-muted-foreground text-center">{text}</p>;
}

function GroupsSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="px-3 py-2 border-b">
        <Skeleton className="h-8 w-full" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b">
          <Skeleton className="size-12 rounded-full shrink-0" />
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

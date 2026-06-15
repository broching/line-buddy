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
} from "@tabler/icons-react";
import { toast } from "sonner";
import Link from "next/link";
import { useEffect } from "react";
import { PaywallGate } from "@/components/billing/paywall-gate";

type GroupWithStats = {
  _id: string;
  displayName: string;
  pictureUrl?: string;
  lineGroupId: string;
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

  if (!org || !groups) return <GroupsSkeleton />;

  const sorted = [...groups].sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));

  // When searching: show all (active + archived) matching results flat
  // When not searching: split into active/archived sections
  const isSearching = search.trim() !== "";
  const matchesSearch = (g: GroupWithStats) =>
    g.displayName.toLowerCase().includes(search.toLowerCase());

  const activeGroups   = sorted.filter((g) =>  g.isActive);
  const archivedGroups = sorted.filter((g) => !g.isActive);

  const searchResults = isSearching ? sorted.filter(matchesSearch) : [];

  const activeCount   = activeGroups.length;
  const archivedCount = archivedGroups.length;

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
        ) : (
          /* ── Normal view: active + archived sections ── */
          <>
            {/* Active groups */}
            {activeGroups.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
                <IconMessage2 className="size-10 text-muted-foreground/30" />
                <p className="font-medium text-sm">No groups connected yet</p>
                <p className="text-xs text-muted-foreground">
                  Add the LINE bot to a group, then click &ldquo;Connect group&rdquo;
                </p>
                <Button size="sm" variant="outline" onClick={() => setShowConnect(true)}>
                  <IconPlus className="size-3.5" />
                  Connect first group
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {activeGroups.map((g) => (
                  <GroupRow
                    key={g._id}
                    group={g}
                    orgSlug={orgSlug}
                    onLeave={() => setLeaveTarget(g)}
                  />
                ))}
              </div>
            )}

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
      />

      {/* Leave confirmation dialog */}
      <Dialog open={!!leaveTarget} onOpenChange={(o) => { if (!o) setLeaveTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Leave group chat?</DialogTitle>
            <DialogDescription>
              The bot will leave <strong>{leaveTarget?.displayName}</strong> on LINE and stop
              monitoring it. Past messages will be preserved in the archive.
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
            <p className="font-semibold text-sm truncate">{group.displayName}</p>
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
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
}) {
  const generateToken = useMutation(api.connectTokens.generate);
  const activeTokens = useQuery(api.connectTokens.listActive, {
    organizationId: orgId as any,
  });

  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");

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
          <DialogTitle>Connect a LINE group</DialogTitle>
          <DialogDescription>
            Generate a token, add the bot to your LINE group, then type the command in the group.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-2">
          <ol className="text-sm text-muted-foreground flex flex-col gap-2 list-decimal list-inside">
            <li>Add your LINE bot to the group chat</li>
            <li>Generate a connect token below</li>
            <li>Type the command in the LINE group</li>
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
                Paste it in your LINE group.
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

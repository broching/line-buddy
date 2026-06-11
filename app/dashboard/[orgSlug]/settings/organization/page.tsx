"use client";

import { use, useState, useEffect, useRef, useCallback } from "react";
import { useOrganization, useUser } from "@clerk/nextjs";
import type {
  OrganizationCustomRoleKey,
  OrganizationMembershipResource,
  OrganizationInvitationResource,
} from "@clerk/types";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  AlertCircle,
  Camera,
  Check,
  Loader2,
  Mail,
  MoreHorizontal,
  Shield,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { key: OrganizationCustomRoleKey; label: string }[] = [
  { key: "org:admin", label: "Admin" },
  { key: "org:member", label: "Member" },
];

function roleLabel(role: string): string {
  if (role === "org:admin") return "Admin";
  if (role === "org:member") return "Member";
  return role.replace("org:", "");
}

function roleBadgeClass(role: string): string {
  if (role === "org:admin")
    return "bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-400";
  return "bg-muted text-muted-foreground";
}

function initials(firstName?: string | null, lastName?: string | null, identifier?: string): string {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
  if (firstName) return firstName[0].toUpperCase();
  if (identifier) return identifier[0].toUpperCase();
  return "?";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 py-2">
      <div>
        <h2 className="text-xl font-semibold">Organization</h2>
        <p className="text-muted-foreground text-sm">
          Manage your organization profile, branding, and team members.
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="mb-2">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">
            <Users className="size-3.5 mr-1.5" />
            Members
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="flex flex-col gap-4 mt-0">
          <GeneralTab />
        </TabsContent>

        <TabsContent value="members" className="flex flex-col gap-4 mt-0">
          <MembersTab orgSlug={orgSlug} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── General Tab ──────────────────────────────────────────────────────────────

function GeneralTab() {
  const { organization, isLoaded } = useOrganization();
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (organization) setName(organization.name);
  }, [organization?.name]);

  const handleSaveName = async () => {
    if (!organization || !name.trim()) return;
    setSavingName(true);
    try {
      await organization.update({ name: name.trim() });
      toast.success("Organization name updated");
    } catch {
      toast.error("Failed to update name");
    } finally {
      setSavingName(false);
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organization) return;
    setUploadingLogo(true);
    try {
      await organization.setLogo({ file });
      toast.success("Logo updated");
    } catch {
      toast.error("Failed to upload logo");
    } finally {
      setUploadingLogo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    if (!organization) return;
    setUploadingLogo(true);
    try {
      await organization.setLogo({ file: null });
      toast.success("Logo removed");
    } catch {
      toast.error("Failed to remove logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  if (!isLoaded) return <GeneralSkeleton />;

  const hasCustomLogo = !!organization?.imageUrl?.includes("img.clerk.com") || !!organization?.imageUrl?.includes("images.clerk.dev");

  return (
    <>
      {/* ── Logo ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Organization Logo</CardTitle>
          <CardDescription>
            Shown in the sidebar switcher and member directory.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-5">
          {/* Clickable avatar */}
          <div className="relative group">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingLogo}
              className="relative block rounded-xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Avatar className="size-20 rounded-xl">
                <AvatarImage src={organization?.imageUrl ?? undefined} />
                <AvatarFallback className="rounded-xl text-2xl font-bold bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                  {organization?.name?.[0]?.toUpperCase() ?? "O"}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingLogo ? (
                  <Loader2 className="size-5 text-white animate-spin" />
                ) : (
                  <Camera className="size-5 text-white" />
                )}
              </div>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoChange}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 w-fit"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingLogo}
            >
              {uploadingLogo ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Camera className="size-3.5" />
              )}
              Upload new logo
            </Button>
            {hasCustomLogo && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 w-fit text-muted-foreground hover:text-destructive"
                onClick={handleRemoveLogo}
                disabled={uploadingLogo}
              >
                <X className="size-3.5" />
                Remove logo
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              PNG, JPG, WEBP · Max 10 MB
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Name ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Organization Name</CardTitle>
          <CardDescription>
            This is your organization's display name across the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1.5 flex-1 max-w-sm">
              <Label htmlFor="org-name" className="sr-only">
                Organization name
              </Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                placeholder="Organization name"
                maxLength={64}
                disabled={savingName}
              />
            </div>
            <Button
              size="sm"
              onClick={handleSaveName}
              disabled={savingName || !name.trim() || name.trim() === organization?.name}
              className="gap-2 shrink-0"
            >
              {savingName ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function GeneralSkeleton() {
  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-56 mt-1" />
        </CardHeader>
        <CardContent className="flex items-center gap-5">
          <Skeleton className="size-20 rounded-xl shrink-0" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-3 w-28" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Skeleton className="h-9 flex-1 max-w-sm" />
            <Skeleton className="h-9 w-28" />
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

const MEMBERS_PARAMS = {
  memberships: { pageSize: 10, keepPreviousData: true },
  invitations: { pageSize: 10, keepPreviousData: true },
};

function MembersTab({ orgSlug }: { orgSlug: string }) {
  const { organization, isLoaded, memberships, invitations } =
    useOrganization(MEMBERS_PARAMS);
  const { user } = useUser();

  // Convex billing — source of truth for seat limits
  const convexOrg = useQuery(api.organizations.get, { slug: orgSlug });
  const billing = useQuery(
    api.billing.getForOrg,
    convexOrg ? { organizationId: convexOrg._id } : "skip"
  );

  const seatCount = memberships?.count ?? 0;
  const maxSeats = billing?.maxSeats ?? 1;
  const atCapacity = seatCount >= maxSeats;

  if (!isLoaded) return <MembersSkeleton />;
  if (!organization) return null;

  return (
    <>
      {/* ── Invite form ── */}
      <InviteSection
        organization={organization}
        onInvited={() => invitations?.revalidate?.()}
        atCapacity={atCapacity}
        seatCount={seatCount}
        maxSeats={maxSeats}
      />

      {/* ── Pending invitations ── */}
      {(invitations?.data?.length ?? 0) > 0 && (
        <PendingInvitationsSection invitations={invitations} />
      )}

      {/* ── Current members ── */}
      <MembersSection
        memberships={memberships}
        currentUserId={user?.id}
        seatCount={seatCount}
        maxSeats={maxSeats}
      />
    </>
  );
}

// ─── Invite section ───────────────────────────────────────────────────────────

function InviteSection({
  organization,
  onInvited,
  atCapacity,
  seatCount,
  maxSeats,
}: {
  organization: NonNullable<ReturnType<typeof useOrganization>["organization"]>;
  onInvited: () => void;
  atCapacity: boolean;
  seatCount: number;
  maxSeats: number;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationCustomRoleKey>("org:member");
  const [loading, setLoading] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || atCapacity) return;
    setLoading(true);
    try {
      await organization.inviteMember({ emailAddress: email.trim(), role });
      toast.success(`Invitation sent to ${email.trim()}`);
      setEmail("");
      onInvited();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send invitation";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserPlus className="size-4 text-indigo-500" />
              Invite a member
            </CardTitle>
            <CardDescription className="mt-1">
              Invite someone to join your organization by email.
            </CardDescription>
          </div>
          {/* Seat counter */}
          <div className={`flex items-center gap-1.5 text-xs shrink-0 rounded-full px-2.5 py-1 border font-medium tabular-nums ${
            atCapacity
              ? "bg-destructive/10 text-destructive border-destructive/20"
              : "bg-muted text-muted-foreground border-transparent"
          }`}>
            <Users className="size-3" />
            {seatCount} / {maxSeats} seats
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {atCapacity && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>
              Seat limit reached ({maxSeats} seats). Upgrade your plan to invite more members.
            </span>
          </div>
        )}
        <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5 flex-1">
            <Label htmlFor="invite-email" className="text-xs text-muted-foreground">
              Email address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="pl-9"
                disabled={loading || atCapacity}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 sm:w-36">
            <Label className="text-xs text-muted-foreground">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as OrganizationCustomRoleKey)}
              disabled={loading || atCapacity}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            size="sm"
            className="gap-2 shrink-0 sm:mb-0"
            disabled={loading || !email.trim() || atCapacity}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <UserPlus className="size-3.5" />
            )}
            Send invite
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Pending invitations ──────────────────────────────────────────────────────

function PendingInvitationsSection({
  invitations,
}: {
  invitations: ReturnType<typeof useOrganization>["invitations"];
}) {
  const [revoking, setRevoking] = useState<string | null>(null);

  const handleRevoke = async (invitation: OrganizationInvitationResource) => {
    setRevoking(invitation.id);
    try {
      await invitation.revoke();
      toast.success(`Invitation to ${invitation.emailAddress} revoked`);
      await invitations?.revalidate?.();
    } catch {
      toast.error("Failed to revoke invitation");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Mail className="size-4 text-amber-500" />
          Pending invitations
          <Badge variant="secondary" className="text-xs font-normal">
            {invitations?.data?.length ?? 0}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {invitations?.data?.map((invitation) => (
            <div
              key={invitation.id}
              className="flex items-center justify-between px-6 py-3 gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Mail className="size-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{invitation.emailAddress}</p>
                  <p className="text-xs text-muted-foreground">
                    Sent {invitation.createdAt.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className={`text-xs ${roleBadgeClass(invitation.role)}`}>
                  {roleLabel(invitation.role)}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                  disabled={revoking === invitation.id}
                  onClick={() => handleRevoke(invitation)}
                >
                  {revoking === invitation.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                  <span className="sr-only">Revoke</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
        {invitations?.hasNextPage && (
          <div className="px-6 py-3 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => invitations.fetchNext?.()}
              disabled={invitations.isFetching}
            >
              {invitations.isFetching ? (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              ) : null}
              Load more
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Current members ──────────────────────────────────────────────────────────

function MembersSection({
  memberships,
  currentUserId,
  seatCount,
  maxSeats,
}: {
  memberships: ReturnType<typeof useOrganization>["memberships"];
  currentUserId: string | undefined;
  seatCount: number;
  maxSeats: number;
}) {
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const handleRoleChange = useCallback(
    async (membership: OrganizationMembershipResource, newRole: OrganizationCustomRoleKey) => {
      setUpdatingRole(membership.id);
      try {
        await membership.update({ role: newRole });
        await memberships?.revalidate?.();
        toast.success("Role updated");
      } catch {
        toast.error("Failed to update role");
      } finally {
        setUpdatingRole(null);
      }
    },
    [memberships],
  );

  const handleRemove = useCallback(
    async (membership: OrganizationMembershipResource) => {
      setRemoving(membership.id);
      try {
        await membership.destroy();
        await memberships?.revalidate?.();
        toast.success("Member removed");
      } catch {
        toast.error("Failed to remove member");
      } finally {
        setRemoving(null);
      }
    },
    [memberships],
  );

  const total = memberships?.count ?? 0;
  const isLoading = memberships?.isLoading ?? false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="size-4 text-teal-500" />
            Team members
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  seatCount >= maxSeats ? "bg-destructive" : "bg-indigo-500"
                }`}
                style={{ width: `${Math.min(100, (seatCount / maxSeats) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {seatCount} / {maxSeats}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="divide-y">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-6 py-3">
                <Skeleton className="size-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-7 w-24 rounded-md" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y">
            {memberships?.data?.map((mem) => {
              const ud = mem.publicUserData;
              const isCurrentUser = ud?.userId === currentUserId;
              const fullName = [ud?.firstName, ud?.lastName].filter(Boolean).join(" ");

              return (
                <div
                  key={mem.id}
                  className="flex items-center justify-between px-6 py-3 gap-4"
                >
                  {/* Avatar + identity */}
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="size-9 shrink-0">
                      <AvatarImage src={ud?.imageUrl ?? undefined} />
                      <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                        {initials(ud?.firstName, ud?.lastName, ud?.identifier)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium truncate">
                          {fullName || ud?.identifier}
                        </p>
                        {isCurrentUser && (
                          <span className="text-xs text-muted-foreground">(you)</span>
                        )}
                      </div>
                      {fullName && ud?.identifier && (
                        <p className="text-xs text-muted-foreground truncate">
                          {ud.identifier}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Role + actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={mem.role}
                      onValueChange={(v) =>
                        handleRoleChange(mem, v as OrganizationCustomRoleKey)
                      }
                      disabled={updatingRole === mem.id || isCurrentUser}
                    >
                      <SelectTrigger className="h-7 text-xs w-28 gap-1">
                        {updatingRole === mem.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <SelectValue />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r.key} value={r.key} className="text-xs">
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {!isCurrentUser && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground"
                            disabled={removing === mem.id}
                          >
                            {removing === mem.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <MoreHorizontal className="size-3.5" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive gap-2"
                            onClick={() => handleRemove(mem)}
                          >
                            <X className="size-3.5" />
                            Remove member
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {(memberships?.hasPreviousPage || memberships?.hasNextPage) && (
          <div className="flex items-center justify-between px-6 py-3 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              disabled={!memberships?.hasPreviousPage || memberships?.isFetching}
              onClick={() => memberships?.fetchPrevious?.()}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              disabled={!memberships?.hasNextPage || memberships?.isFetching}
              onClick={() => memberships?.fetchNext?.()}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MembersSkeleton() {
  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-56 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-24" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="p-0">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-6 py-3">
              <Skeleton className="size-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-52" />
              </div>
              <Skeleton className="h-7 w-24 rounded-md" />
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

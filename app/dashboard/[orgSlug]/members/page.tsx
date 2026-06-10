"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { IconTrash, IconUserPlus } from "@tabler/icons-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { PaywallGate } from "@/components/billing/paywall-gate";

type OrgRole = "owner" | "admin" | "member";

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const ROLE_BADGE_VARIANT: Record<OrgRole, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
};

export default function MembersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const members = useQuery(
    api.memberships.list,
    org ? { organizationId: org._id } : "skip"
  );

  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  if (!org || !members) return <MembersSkeleton />;

  const myRole = org.myRole;
  const canManage = myRole === "owner" || myRole === "admin";

  return (
    <PaywallGate organizationId={org._id}>
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div>
        <h2 className="text-xl font-semibold">Members</h2>
        <p className="text-muted-foreground text-sm">
          {members.length} member{members.length !== 1 ? "s" : ""} ·{" "}
          Dashboard access only. LINE group roles are configured per group chat.
        </p>
      </div>

      {ConfirmDialogNode}

      {canManage && <InviteCard orgId={org._id} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Team members</CardTitle>
          <CardDescription>
            Owners manage billing. Admins can manage templates, settings, and invite others.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {members.map((m) => (
              <MemberRow
                key={m._id}
                membershipId={m._id}
                user={m.user}
                orgRole={m.orgRole}
                orgId={org._id}
                myRole={myRole}
                confirm={confirmDialog}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
    </PaywallGate>
  );
}

function InviteCard({ orgId }: { orgId: Id<"organizations"> }) {
  const addMember = useMutation(api.memberships.addByEmail);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [loading, setLoading] = useState(false);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await addMember({ organizationId: orgId, email: email.trim(), orgRole: role });
      toast.success("Member added successfully");
      setEmail("");
      setRole("member");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <IconUserPlus className="size-4" />
          Add member
        </CardTitle>
        <CardDescription>
          They must have already signed up with this email address.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleInvite} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as "admin" | "member")}
              disabled={loading}
            >
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">
                  <div className="flex flex-col">
                    <span>Member</span>
                    <span className="text-xs text-muted-foreground">Standard dashboard access</span>
                  </div>
                </SelectItem>
                <SelectItem value="admin">
                  <div className="flex flex-col">
                    <span>Admin</span>
                    <span className="text-xs text-muted-foreground">Can manage templates, LINE settings, and members</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={loading || !email.trim()}>
              {loading ? "Adding…" : "Add member"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MemberRow({
  membershipId,
  user,
  orgRole,
  orgId,
  myRole,
  confirm: confirmDialog,
}: {
  membershipId: Id<"memberships">;
  user: { name: string; email?: string } | null;
  orgRole: OrgRole;
  orgId: Id<"organizations">;
  myRole: OrgRole;
  confirm: ReturnType<typeof useConfirm>["confirmDialog"];
}) {
  const removeMember = useMutation(api.memberships.remove);
  const setRole = useMutation(api.memberships.setRole);
  const [removing, setRemoving] = useState(false);

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  const canEdit =
    (myRole === "owner" || myRole === "admin") &&
    orgRole !== "owner"; // cannot edit owner's role

  const canRemove =
    (myRole === "owner" || myRole === "admin") &&
    orgRole !== "owner";

  async function handleRemove() {
    const ok = await confirmDialog({
      title: `Remove ${user?.name ?? "this member"}?`,
      description: "They will lose access to the dashboard immediately.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    setRemoving(true);
    try {
      await removeMember({ organizationId: orgId, membershipId });
      toast.success("Member removed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
      setRemoving(false);
    }
  }

  async function handleRoleChange(newRole: string) {
    try {
      await setRole({
        organizationId: orgId,
        membershipId,
        orgRole: newRole as OrgRole,
      });
      toast.success(`Role changed to ${ROLE_LABELS[newRole as OrgRole]}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar className="size-8">
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{user?.name ?? "Unknown"}</p>
        {user?.email && (
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {canEdit ? (
          <Select value={orgRole} onValueChange={handleRoleChange}>
            <SelectTrigger className="h-7 text-xs w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              {myRole === "owner" && (
                <SelectItem value="owner">Owner</SelectItem>
              )}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant={ROLE_BADGE_VARIANT[orgRole]} className="text-xs">
            {ROLE_LABELS[orgRole]}
          </Badge>
        )}
        {canRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            onClick={handleRemove}
            disabled={removing}
          >
            <IconTrash className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function MembersSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

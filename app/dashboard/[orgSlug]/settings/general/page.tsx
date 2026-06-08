"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function SettingsGeneralPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const updateOrg = useMutation(api.organizations.update);

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (org) setName(org.name);
  }, [org]);

  if (!org) return <SettingsSkeleton />;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name === org!.name) return;
    setSaving(true);
    try {
      await updateOrg({ organizationId: org!._id, name: name.trim() });
      toast.success("Organization name updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold">General settings</h2>
        <p className="text-muted-foreground text-sm">
          Manage your organization's basic information.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Organization</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-name">Name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Slug</Label>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded">{org.slug}</code>
                <span className="text-muted-foreground text-xs">
                  Used in URLs. Cannot be changed.
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Plan</Label>
              <div>
                <Badge variant="outline" className="capitalize">
                  {org.planId}
                </Badge>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={saving || !name.trim() || name === org.name}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Billing</CardTitle>
          <CardDescription>Manage your subscription plan.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Billing management coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 max-w-2xl">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

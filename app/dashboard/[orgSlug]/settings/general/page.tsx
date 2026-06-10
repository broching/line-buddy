"use client";

import { use, useRef, useState, useEffect } from "react";
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
import { IconCamera, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";

// Deterministic color based on org name (matches sidebar)
function orgColorClass(name: string): string {
  const colors = [
    "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-green-600",
    "bg-teal-500", "bg-blue-600", "bg-indigo-500", "bg-purple-600", "bg-pink-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function SettingsGeneralPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const updateOrg = useMutation(api.organizations.update);
  const generateUploadUrl = useMutation(api.organizations.generateUploadUrl);
  const updateProfileImage = useMutation(api.organizations.updateProfileImage);
  const removeProfileImage = useMutation(api.organizations.removeProfileImage);

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !org) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    setUploadingImage(true);
    try {
      const uploadUrl = await generateUploadUrl({ organizationId: org._id });
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json();
      await updateProfileImage({ organizationId: org._id, storageId });
      toast.success("Profile image updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveImage() {
    if (!org) return;
    try {
      await removeProfileImage({ organizationId: org._id });
      toast.success("Profile image removed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove image");
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

      {/* Profile image card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Profile image</CardTitle>
          <CardDescription>
            Shown in the sidebar and org switcher. Recommended: square, at least 128×128px.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {/* Avatar preview */}
            <div className="relative shrink-0">
              {org.profileImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={org.profileImageUrl}
                  alt={org.name}
                  className="size-16 rounded-xl object-cover"
                />
              ) : (
                <div
                  className={`size-16 ${orgColorClass(org.name)} rounded-xl flex items-center justify-center text-white text-2xl font-bold`}
                >
                  {org.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={uploadingImage}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2"
              >
                <IconCamera className="size-3.5" />
                {uploadingImage ? "Uploading…" : "Upload image"}
              </Button>
              {org.profileImageUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={uploadingImage}
                  onClick={handleRemoveImage}
                  className="flex items-center gap-2 text-destructive hover:text-destructive"
                >
                  <IconTrash className="size-3.5" />
                  Remove
                </Button>
              )}
              <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 5MB</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Name + slug */}
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
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

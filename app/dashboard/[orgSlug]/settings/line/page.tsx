"use client";

import { use, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconCheck,
  IconCopy,
  IconRefresh,
  IconMessage2,
} from "@tabler/icons-react";
import { toast } from "sonner";
import Link from "next/link";

export default function LineSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const activeTokens = useQuery(
    api.connectTokens.listActive,
    org ? { organizationId: org._id } : "skip"
  );
  const generateToken = useMutation(api.connectTokens.generate);

  const [copied, setCopied] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  if (!org) return <Skeleton className="h-64 rounded-xl mx-4 lg:mx-6" />;

  const convexSiteUrl = (process.env.NEXT_PUBLIC_CONVEX_URL ?? "")
    .replace(".convex.cloud", ".convex.site");
  const webhookUrl = `${convexSiteUrl}/webhooks/line`;

  async function handleCopyWebhook() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleGenerateToken() {
    setGenerating(true);
    setNewToken(null);
    try {
      const token = await generateToken({ organizationId: org!._id });
      setNewToken(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate token");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyToken(token: string) {
    await navigator.clipboard.writeText(token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
    toast.success("Token copied");
  }

  const activeToken = newToken ?? activeTokens?.[0]?.token ?? null;
  const tokenExpiresAt = !newToken && activeTokens?.[0]
    ? activeTokens[0].expiresAt
    : newToken
    ? Date.now() + 10 * 60 * 1000
    : null;

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold">LINE Integration</h2>
        <p className="text-muted-foreground text-sm">
          Connect your LINE groups to Line Buddy using the shared bot.
        </p>
      </div>

      {/* Bot status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Bot status</CardTitle>
            <Badge variant="default" className="bg-green-600 hover:bg-green-600">
              Active
            </Badge>
          </div>
          <CardDescription>
            Line Buddy uses a shared bot — no credentials required. Just add the bot to your LINE group and connect it below.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Connect a group */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Connect a LINE group</CardTitle>
          <CardDescription>
            Generate a one-time connect token, then send it as a message in your LINE group. The bot will link the group to your organization automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ol className="text-sm text-muted-foreground flex flex-col gap-2 list-decimal list-inside">
            <li>Add the Line Buddy bot to your LINE group chat.</li>
            <li>Generate a connect token below.</li>
            <li>Send the token as a message in the LINE group (within 10 minutes).</li>
            <li>The group will appear in your{" "}
              <Link href={`/dashboard/${orgSlug}/groups`} className="underline text-foreground">
                Group Chats
              </Link>{" "}
              page.
            </li>
          </ol>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="w-fit"
              onClick={handleGenerateToken}
              disabled={generating}
            >
              <IconRefresh className={`size-4 ${generating ? "animate-spin" : ""}`} />
              {generating ? "Generating…" : "Generate connect token"}
            </Button>

            {activeToken && (
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={activeToken}
                  className="font-mono text-sm w-40"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopyToken(activeToken)}
                >
                  {copiedToken ? (
                    <IconCheck className="size-4 text-green-500" />
                  ) : (
                    <IconCopy className="size-4" />
                  )}
                </Button>
                {tokenExpiresAt && (
                  <span className="text-xs text-muted-foreground">
                    expires {new Date(tokenExpiresAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Webhook URL — read-only reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Webhook URL</CardTitle>
          <CardDescription>
            Your organization&apos;s unique webhook endpoint. This is pre-configured — no action needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              readOnly
              value={webhookUrl}
              className="font-mono text-xs bg-muted"
            />
            <Button variant="outline" size="icon" onClick={handleCopyWebhook}>
              {copied ? (
                <IconCheck className="size-4 text-green-500" />
              ) : (
                <IconCopy className="size-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Linked groups shortcut */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Manage connected groups</CardTitle>
          <CardDescription>
            View and manage all LINE groups linked to your organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={`/dashboard/${orgSlug}/groups`}>
            <Button variant="outline">
              <IconMessage2 className="size-4" />
              Go to Group Chats
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

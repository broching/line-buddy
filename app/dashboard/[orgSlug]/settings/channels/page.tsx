"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { IconBrandLine, IconBrandWhatsapp, IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import { PaywallGate } from "@/components/billing/paywall-gate";

export default function ChannelsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const waSession = useQuery(
    api.whatsappSessions.getForOrg,
    org ? { organizationId: org._id } : "skip"
  );

  if (!org) return <Skeleton className="h-64 rounded-xl mx-4 lg:mx-6 mt-4" />;

  const waManaged = org.whatsappMode === "managed";
  const waConnected = !!waSession?.connected;

  return (
    <PaywallGate organizationId={org._id}>
      <div className="w-full px-4 lg:px-6 py-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">Channels</h2>
          <p className="text-muted-foreground text-sm">
            Connect the messaging platforms your team uses. Pick one to configure.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 max-w-5xl">
          <ChannelCard
            href={`/dashboard/${orgSlug}/settings/line`}
            icon={<IconBrandLine className="size-7 text-[#06C755]" />}
            name="LINE"
            description="Shared LeadMighty bot, or connect your own LINE channel."
            status={
              <Badge className="bg-green-600 hover:bg-green-600">
                {org.lineMode === "byok" ? "Your own bot" : "Managed bot"}
              </Badge>
            }
          />
          <ChannelCard
            href={`/dashboard/${orgSlug}/settings/whatsapp`}
            icon={<IconBrandWhatsapp className="size-7 text-green-600" />}
            name="WhatsApp"
            description="Use the shared LeadMighty bot, or bring your own number via QR."
            status={
              waManaged ? (
                <Badge className="bg-green-600 hover:bg-green-600">Managed bot</Badge>
              ) : waConnected ? (
                <Badge className="bg-green-600 hover:bg-green-600">Connected</Badge>
              ) : waSession?.status === "need_scan" ? (
                <Badge variant="secondary">Awaiting scan</Badge>
              ) : (
                <Badge variant="outline">Not connected</Badge>
              )
            }
          />
        </div>
      </div>
    </PaywallGate>
  );
}

function ChannelCard({
  href,
  icon,
  name,
  description,
  status,
}: {
  href: string;
  icon: React.ReactNode;
  name: string;
  description: string;
  status: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border bg-card p-5 flex flex-col gap-3 hover:border-primary/50 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted/60 p-2.5">{icon}</div>
          <span className="font-semibold text-base">{name}</span>
        </div>
        {status}
      </div>
      <p className="text-sm text-muted-foreground flex-1">{description}</p>
      <div className="flex items-center gap-1 text-sm font-medium text-primary">
        Configure
        <IconChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

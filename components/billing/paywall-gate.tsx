"use client";

import { useQuery } from "convex/react";
import { useClerk } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconSparkles,
  IconCheck,
  IconCreditCard,
} from "@tabler/icons-react";
import { useTheme as useNextTheme } from "next-themes";

const PLAN_FEATURES = [
  { key: "1000_credits", label: "1,000 AI credits per billing period", desc: "Process messages, extract fields, and answer questions" },
  { key: "1gb_knowledge_sources", label: "1 GB knowledge sources storage", desc: "Upload documents to train your bot" },
  { key: "5_seats", label: "Up to 5 team members", desc: "Collaborate with your team on the dashboard" },
  { key: "unlimited_group_chats", label: "Unlimited LINE group chats", desc: "Connect as many groups as you need" },
  { key: "unlimited_templates", label: "Unlimited workflow templates", desc: "Create templates for any use case" },
];

export function PaywallGate({
  organizationId,
  children,
}: {
  organizationId: Id<"organizations">;
  children: React.ReactNode;
}) {
  const billing = useQuery(api.billing.getForOrg, { organizationId });

  if (billing === undefined) {
    return (
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  // TODO: re-enable payment gating for production
  if (!billing.isActive) {
    return <UpgradeWall />;
  }

  return <>{children}</>;
}

function UpgradeWall() {
  const { openOrganizationProfile } = useClerk();
  const { theme } = useNextTheme();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border bg-card shadow-sm p-8 flex flex-col gap-6">
          {/* Icon + headline */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <IconSparkles className="size-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Upgrade to LeadMighty</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Unlock all features and start automating your LINE group workflows.
              </p>
            </div>
          </div>

          {/* Feature list */}
          <ul className="flex flex-col gap-3">
            {PLAN_FEATURES.map((f) => (
              <li key={f.key} className="flex items-start gap-3">
                <div className="size-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                  <IconCheck className="size-3 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <Button
            size="lg"
            className="w-full gap-2"
            onClick={() =>
              openOrganizationProfile({
                appearance: { baseTheme: theme === "dark" ? dark : undefined },
              })
            }
          >
            <IconCreditCard className="size-4" />
            Manage subscription
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Open your organization settings to subscribe and manage billing.
          </p>
        </div>
      </div>
    </div>
  );
}

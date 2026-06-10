"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useOrganization } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { OrgSidebar } from "./org-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { OrgHeader } from "./org-header";

export function OrgLayoutClient({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = use(params);
  const router = useRouter();
  const org = useQuery(api.organizations.get, { slug: orgSlug });
  const { organization: clerkOrg } = useOrganization();

  // org === undefined → loading; org === null → not found / not a member
  if (org === null) {
    // Race condition: Clerk session has this org but webhook hasn't created it in Convex yet.
    // Show nothing briefly rather than redirect — the query will resolve within seconds.
    if (clerkOrg?.slug === orgSlug) {
      return null;
    }
    router.replace("/dashboard");
    return null;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 64)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <OrgSidebar
        orgSlug={orgSlug}
        orgName={org?.name ?? ""}
        orgImageUrl={org?.profileImageUrl ?? null}
        myRole={org?.myRole}
      />
      <SidebarInset>
        <OrgHeader orgSlug={orgSlug} orgName={org?.name ?? ""} />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

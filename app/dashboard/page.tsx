"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect } from "react";

export default function DashboardRootPage() {
  const router = useRouter();
  const orgs = useQuery(api.organizations.listForUser);

  useEffect(() => {
    if (orgs === undefined) return; // still loading
    if (orgs.length === 0) {
      router.replace("/onboarding");
    } else {
      router.replace(`/dashboard/${orgs[0]!.slug}/overview`);
    }
  }, [orgs, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-muted-foreground text-sm">Loading…</div>
    </div>
  );
}

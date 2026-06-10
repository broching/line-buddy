"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CreateOrganization, useOrganizationList } from "@clerk/nextjs";
import { Logo } from "@/components/logo";

export default function OnboardingPage() {
  const router = useRouter();
  const { userMemberships, isLoaded } = useOrganizationList({
    userMemberships: { infinite: false },
  });

  // Redirect to dashboard if user already has orgs
  useEffect(() => {
    if (!isLoaded) return;
    const firstOrg = userMemberships.data?.[0];
    if (firstOrg?.organization.slug) {
      router.replace(`/dashboard/${firstOrg.organization.slug}/overview`);
    }
  }, [isLoaded, userMemberships, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      <Logo />
      <CreateOrganization
        afterCreateOrganizationUrl="/dashboard/:slug/overview"
        skipInvitationScreen
      />
    </div>
  );
}

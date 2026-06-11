"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateOrganization, useOrganizationList } from "@clerk/nextjs";
import { Logo } from "@/components/logo";

export default function OnboardingPage() {
  const router = useRouter();
  const [activating, setActivating] = useState(false);
  const { userMemberships, isLoaded, setActive } = useOrganizationList({
    userMemberships: { infinite: false },
  });

  // If user already belongs to a Clerk org (e.g. was invited), activate it and redirect.
  // setActive is required so the JWT carries org_id — without it organizations.get
  // can't grant access via the webhook-race fallback.
  useEffect(() => {
    if (!isLoaded || activating) return;
    const firstOrg = userMemberships.data?.[0];
    if (firstOrg?.organization.id) {
      setActivating(true);
      setActive({ organization: firstOrg.organization.id }).then(() => {
        router.replace(`/dashboard/${firstOrg.organization.slug}/overview`);
      });
    }
  }, [isLoaded, userMemberships, router, setActive, activating]);

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

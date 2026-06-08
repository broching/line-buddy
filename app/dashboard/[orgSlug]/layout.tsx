import { OrgLayoutClient } from "./_components/org-layout-client";

export default function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  return <OrgLayoutClient params={params}>{children}</OrgLayoutClient>;
}

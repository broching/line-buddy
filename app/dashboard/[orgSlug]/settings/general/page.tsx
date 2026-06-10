import { redirect } from "next/navigation";

export default async function GeneralSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/dashboard/${orgSlug}/settings/billing`);
}

"use client";

import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

function getPageTitle(pathname: string, orgSlug: string): string {
  const base = `/dashboard/${orgSlug}`;
  if (pathname === `${base}/overview`) return "Overview";
  if (pathname.startsWith(`${base}/projects`)) return "Projects";
  if (pathname.startsWith(`${base}/groups`)) return "Group Chats";
  if (pathname.startsWith(`${base}/templates`)) return "Templates";
  if (pathname.startsWith(`${base}/members`)) return "Members";
  if (pathname.startsWith(`${base}/settings`)) return "Settings";
  if (pathname.startsWith(`${base}/activity`)) return "Activity";
  return "Line Buddy";
}

export function OrgHeader({
  orgSlug,
  orgName,
}: {
  orgSlug: string;
  orgName: string;
}) {
  const pathname = usePathname();
  const title = getPageTitle(pathname, orgSlug);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>
      </div>
    </header>
  );
}

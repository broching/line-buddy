"use client";

import {
  IconActivity,
  IconBooks,
  IconChartBar,
  IconChartLine,
  IconFolderOpen,
  IconMessage2,
  IconTemplate,
  IconUsers,
  IconSettings,
  IconHelp,
  IconBuildingCommunity,
  IconBrightness,
} from "@tabler/icons-react";
import { ModeToggle } from "@/components/mode-toggle";
import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { LogoIcon } from "@/components/logo";
import { NavUser } from "@/app/dashboard/nav-user";

export function OrgSidebar({
  orgSlug,
  orgName,
}: {
  orgSlug: string;
  orgName: string;
}) {
  const base = `/dashboard/${orgSlug}`;
  const pathname = usePathname();
  const router = useRouter();
  const [optimisticPath, setOptimisticPath] = useOptimistic(pathname);
  const [isPending, startTransition] = useTransition();

  const orgs = useQuery(api.organizations.listForUser);

  const navigate = (url: string) => {
    startTransition(() => {
      setOptimisticPath(url);
      router.push(url);
    });
  };

  const mainNav = [
    { title: "Overview", url: `${base}/overview`, icon: IconChartBar },
    { title: "Projects", url: `${base}/projects`, icon: IconFolderOpen },
    { title: "Group Chats", url: `${base}/groups`, icon: IconMessage2 },
    { title: "Templates", url: `${base}/templates`, icon: IconTemplate },
    { title: "Knowledge Sources", url: `${base}/knowledge-sources`, icon: IconBooks },
    { title: "Members", url: `${base}/members`, icon: IconUsers },
    { title: "Analytics", url: `${base}/analytics`, icon: IconChartLine },
    { title: "Activity", url: `${base}/activity`, icon: IconActivity },
  ];

  const settingsNav = [
    { title: "General", url: `${base}/settings/general`, icon: IconSettings },
    { title: "LINE", url: `${base}/settings/line`, icon: IconMessage2 },
    { title: "Help", url: "#", icon: IconHelp },
  ];

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <button onClick={() => navigate(base + "/overview")}>
                <LogoIcon className="!size-6" />
                <span className="text-base font-semibold truncate">{orgName}</span>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent
            className="flex flex-col gap-1"
            data-pending={isPending ? "" : undefined}
          >
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={optimisticPath.startsWith(item.url)}
                    onClick={() => navigate(item.url)}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Org switcher — only shown when user has multiple orgs */}
        {orgs && orgs.length > 1 && (
          <SidebarGroup className="mt-auto">
            <SidebarGroupLabel>Switch organization</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {orgs.map((org) => (
                  <SidebarMenuItem key={org!._id}>
                    <SidebarMenuButton
                      isActive={org!.slug === orgSlug}
                      onClick={() => navigate(`/dashboard/${org!.slug}/overview`)}
                    >
                      <IconBuildingCommunity />
                      <span className="truncate">{org!.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup className={orgs && orgs.length > 1 ? "" : "mt-auto"}>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={optimisticPath.startsWith(item.url)}
                    onClick={() => navigate(item.url)}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <label className="cursor-pointer">
                    <IconBrightness />
                    <span>Dark Mode</span>
                    <span className="ml-auto">
                      <ModeToggle />
                    </span>
                  </label>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

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
  IconBrightness,
  IconCheck,
  IconPlus,
  IconSelector,
  IconCreditCard,
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
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NavUser } from "@/app/dashboard/nav-user";

// Deterministic color based on org name for avatar fallback
function orgColorClass(name: string): string {
  const colors = [
    "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-green-600",
    "bg-teal-500", "bg-blue-600", "bg-indigo-500", "bg-purple-600", "bg-pink-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

function OrgAvatar({
  name,
  imageUrl,
  className = "size-8",
}: {
  name: string;
  imageUrl?: string | null;
  className?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        className={`${className} rounded-md object-cover shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${className} ${orgColorClass(name)} rounded-md flex items-center justify-center text-white font-bold text-sm shrink-0`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function OrgSidebar({
  orgSlug,
  orgName,
  myRole,
}: {
  orgSlug: string;
  orgName: string;
  myRole?: "owner" | "admin" | "member";
}) {
  const base = `/dashboard/${orgSlug}`;
  const pathname = usePathname();
  const router = useRouter();
  const [optimisticPath, setOptimisticPath] = useOptimistic(pathname);
  const [isPending, startTransition] = useTransition();

  const orgs = useQuery(api.organizations.listForUser);
  const currentOrg = orgs?.find((o) => o?.slug === orgSlug);

  const navigate = (url: string) => {
    startTransition(() => {
      setOptimisticPath(url);
      router.push(url);
    });
  };

  const isAdmin = myRole === "owner" || myRole === "admin";

  const mainNav = [
    { title: "Overview", url: `${base}/overview`, icon: IconChartBar },
    { title: "Projects", url: `${base}/projects`, icon: IconFolderOpen },
    { title: "Group Chats", url: `${base}/groups`, icon: IconMessage2 },
    { title: "Templates", url: `${base}/templates`, icon: IconTemplate },
    { title: "Knowledge Sources", url: `${base}/knowledge-sources`, icon: IconBooks },
    ...(isAdmin ? [{ title: "Members", url: `${base}/members`, icon: IconUsers }] : []),
    { title: "Analytics", url: `${base}/analytics`, icon: IconChartLine },
    { title: "Activity", url: `${base}/activity`, icon: IconActivity },
  ];

  const settingsNav = [
    { title: "General", url: `${base}/settings/general`, icon: IconSettings },
    { title: "LINE", url: `${base}/settings/line`, icon: IconMessage2 },
    { title: "Billing", url: `${base}/settings/billing`, icon: IconCreditCard },
    { title: "Help", url: "#", icon: IconHelp },
  ];

  const roleLabel = myRole === "owner" ? "Owner" : myRole === "admin" ? "Admin" : "Member";

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <OrgAvatar
                    name={orgName}
                    imageUrl={currentOrg?.profileImageUrl}
                    className="size-8"
                  />
                  <div className="flex flex-col flex-1 text-left min-w-0">
                    <span className="text-sm font-semibold truncate">{orgName}</span>
                    <span className="text-xs text-muted-foreground">{roleLabel}</span>
                  </div>
                  <IconSelector className="ml-auto size-4 text-muted-foreground shrink-0" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-64"
                align="start"
                side="bottom"
                sideOffset={4}
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  Organizations
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {orgs?.map((org) =>
                  org ? (
                    <DropdownMenuItem
                      key={org._id}
                      onClick={() => navigate(`/dashboard/${org.slug}/overview`)}
                      className="flex items-center gap-2 py-2"
                    >
                      <OrgAvatar name={org.name} imageUrl={org.profileImageUrl} className="size-6" />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm truncate">{org.name}</span>
                        <span className="text-xs text-muted-foreground capitalize">{org.myRole}</span>
                      </div>
                      {org.slug === orgSlug && (
                        <IconCheck className="size-4 text-primary shrink-0" />
                      )}
                    </DropdownMenuItem>
                  ) : null
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate("/dashboard/new")}
                  className="flex items-center gap-2"
                >
                  <div className="size-6 rounded-md border-2 border-dashed border-muted-foreground/40 flex items-center justify-center">
                    <IconPlus className="size-3 text-muted-foreground" />
                  </div>
                  <span className="text-sm">New organization</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

        <SidebarGroup className="mt-auto">
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

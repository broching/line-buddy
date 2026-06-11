"use client";

import {
  IconActivity,
  IconBooks,
  IconBuilding,
  IconChartBar,
  IconChartLine,
  IconFolderOpen,
  IconMessage2,
  IconTemplate,
  IconBrightness,
  IconCreditCard,
} from "@tabler/icons-react";
import { ModeToggle } from "@/components/mode-toggle";
import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { OrganizationSwitcher } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";

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
import { NavUser } from "@/app/dashboard/nav-user";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
};

function NavSection({
  label,
  items,
  optimisticPath,
  navigate,
}: {
  label?: string;
  items: NavItem[];
  optimisticPath: string;
  navigate: (url: string) => void;
}) {
  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                isActive={optimisticPath.startsWith(item.url)}
                onClick={() => navigate(item.url)}
              >
                <item.icon className="size-4" />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function OrgSidebar({
  orgSlug,
  orgName,
  myRole,
}: {
  orgSlug: string;
  orgName: string;
  orgImageUrl?: string | null; // kept for compat — OrganizationSwitcher renders its own avatar
  myRole?: "owner" | "admin" | "member";
}) {
  const base = `/dashboard/${orgSlug}`;
  const pathname = usePathname();
  const router = useRouter();
  const [optimisticPath, setOptimisticPath] = useOptimistic(pathname);
  const [isPending, startTransition] = useTransition();
  const { resolvedTheme } = useTheme();

  const navigate = (url: string) => {
    startTransition(() => {
      setOptimisticPath(url);
      router.push(url);
    });
  };

  // ── Section: Workspace ───────────────────────────────────────────────────────
  const workspaceNav: NavItem[] = [
    { title: "Overview", url: `${base}/overview`, icon: IconChartBar },
    { title: "Projects", url: `${base}/projects`, icon: IconFolderOpen },
    { title: "Group Chats", url: `${base}/groups`, icon: IconMessage2 },
  ];

  // ── Section: Setup ───────────────────────────────────────────────────────────
  const setupNav: NavItem[] = [
    { title: "Templates", url: `${base}/templates`, icon: IconTemplate },
    { title: "Knowledge Sources", url: `${base}/knowledge-sources`, icon: IconBooks },
  ];

  // ── Section: Reports ─────────────────────────────────────────────────────────
  const reportsNav: NavItem[] = [
    { title: "Analytics", url: `${base}/analytics`, icon: IconChartLine },
    { title: "Activity", url: `${base}/activity`, icon: IconActivity },
  ];

  // ── Section: Settings (bottom) — admin/owner only ────────────────────────────
  const isAdmin = myRole === "owner" || myRole === "admin";
  const settingsNav: NavItem[] = isAdmin
    ? [
        { title: "Organization", url: `${base}/settings/organization`, icon: IconBuilding },
        { title: "Billing", url: `${base}/settings/billing`, icon: IconCreditCard },
      ]
    : [];

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <div className="px-1 py-1">
          <OrganizationSwitcher
            afterSelectOrganizationUrl="/dashboard/:slug/overview"
            afterCreateOrganizationUrl="/dashboard/:slug/overview"
            afterLeaveOrganizationUrl="/dashboard"
            hidePersonal
            appearance={{
              baseTheme: resolvedTheme === "dark" ? dark : undefined,
              elements: {
                rootBox: "w-full",
                organizationSwitcherTrigger:
                  "w-full rounded-md px-2 h-12 text-left justify-start gap-3 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent transition-none",
                organizationSwitcherTriggerIcon: "ml-auto",
                organizationPreviewTextContainer: "leading-tight",
                organizationPreviewMainIdentifier: "text-sm font-semibold",
                organizationPreviewSecondaryIdentifier: "hidden",
              },
            }}
          />
        </div>
      </SidebarHeader>

      <SidebarContent data-pending={isPending ? "" : undefined}>
        <NavSection
          label="Workspace"
          items={workspaceNav}
          optimisticPath={optimisticPath}
          navigate={navigate}
        />

        <NavSection
          label="Setup"
          items={setupNav}
          optimisticPath={optimisticPath}
          navigate={navigate}
        />

        <NavSection
          label="Reports"
          items={reportsNav}
          optimisticPath={optimisticPath}
          navigate={navigate}
        />

        {/* Settings pushed to bottom — only for admins/owners */}
        <SidebarGroup className="mt-auto">
          {isAdmin && <SidebarGroupLabel>Settings</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={optimisticPath.startsWith(item.url)}
                    onClick={() => navigate(item.url)}
                  >
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <label className="cursor-pointer">
                    <IconBrightness className="size-4" />
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

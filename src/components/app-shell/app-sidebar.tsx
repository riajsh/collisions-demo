"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { signOut } from "@/app/(auth)/login/actions";
import { ViewAsSelector } from "@/components/app-shell/view-as-selector";
import { MAIN_NAV, type NavItem } from "@/config/navigation";
import type { AppUser } from "@/lib/auth/session";
import type { OrgUser } from "@/lib/data/users";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type AppSidebarProps = {
  user: AppUser;
  profileId: string | null;
  teamUsers: OrgUser[];
  viewAsOwnerId?: string;
};

function isNavItemActive(pathname: string, item: NavItem) {
  if (item.href === "/") {
    return pathname === "/";
  }
  return pathname.startsWith(item.href);
}

function SidebarNavLink({
  item,
  isActive,
}: {
  item: NavItem;
  isActive: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-body transition-colors",
        isActive
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/70",
      )}
    >
      <item.icon className="size-4 shrink-0 opacity-80" aria-hidden />
      <span>{item.label}</span>
    </Link>
  );
}

function SidebarNavPlaceholder({ item }: { item: NavItem }) {
  return (
    <button
      type="button"
      disabled
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-body text-muted-foreground opacity-60"
    >
      <item.icon className="size-4 shrink-0" aria-hidden />
      <span>{item.label}</span>
    </button>
  );
}

function SidebarMeSection({
  user,
  profileId,
}: {
  user: AppUser;
  profileId: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const meHref = profileId ? `/profiles/${profileId}` : "/me";
  const drawerProfileId = searchParams.get("profile");
  const isMeActive =
    pathname === "/me" ||
    (profileId != null &&
      (pathname === `/profiles/${profileId}` ||
        pathname.startsWith(`/profiles/${profileId}/`) ||
        (pathname === "/profiles" && drawerProfileId === profileId)));

  return (
    <Link
      href={meHref}
      aria-current={isMeActive ? "page" : undefined}
      className={cn(
        "mb-3 block rounded-md px-3 py-2.5 transition-colors hover:bg-sidebar-accent/70",
        isMeActive && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
    >
      <p className="truncate text-subheading font-medium">{user.full_name}</p>
      <p className="truncate text-caption text-muted-foreground">{user.email}</p>
      <p className="mt-1 text-caption text-interactive-primary">
        {profileId ? "My profile" : "My account"}
      </p>
    </Link>
  );
}

function SidebarMeFallback({ user }: { user: AppUser }) {
  return (
    <div className="mb-3 rounded-md px-3 py-2.5">
      <p className="truncate text-subheading font-medium">{user.full_name}</p>
      <p className="truncate text-caption text-muted-foreground">{user.email}</p>
    </div>
  );
}

export function AppSidebar({
  user,
  profileId,
  teamUsers,
  viewAsOwnerId,
}: AppSidebarProps) {
  const pathname = usePathname();

  const visibleNav = MAIN_NAV.filter(
    (item) => !item.adminOnly || user.role === "admin",
  );
  const activeNav = visibleNav.filter((item) => !item.disabled);
  const upcomingNav = visibleNav.filter((item) => item.disabled);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="shrink-0 border-b border-sidebar-border px-4 py-5">
        <Link
          href="/"
          className="text-subheading font-semibold tracking-tight text-sidebar-foreground transition-colors hover:text-sidebar-accent-foreground"
        >
          Ecosystem
        </Link>
      </div>

      <nav
        aria-label="Main navigation"
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4"
      >
        <ul className="flex flex-col gap-0.5">
          {activeNav.map((item) => (
            <li key={item.href}>
              <SidebarNavLink
                item={item}
                isActive={isNavItemActive(pathname, item)}
              />
            </li>
          ))}
        </ul>

        {upcomingNav.length > 0 ? (
          <div className="mt-8">
            <p className="mb-2 px-3 text-label font-medium uppercase tracking-wide text-muted-foreground">
              Coming soon
            </p>
            <ul className="flex flex-col gap-0.5">
              {upcomingNav.map((item) => (
                <li key={item.href}>
                  <SidebarNavPlaceholder item={item} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </nav>

      <div className="mt-auto shrink-0 border-t border-sidebar-border p-3">
        {user.role === "admin" && teamUsers.length > 0 ? (
          <ViewAsSelector
            teamUsers={teamUsers}
            activeOwnerId={viewAsOwnerId}
          />
        ) : null}
        <Suspense fallback={<SidebarMeFallback user={user} />}>
          <SidebarMeSection user={user} profileId={profileId} />
        </Suspense>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_NAV } from "@/config/admin-navigation";
import { cn } from "@/lib/utils";

function isAdminNavActive(pathname: string, href: string) {
  if (pathname === href) {
    return true;
  }
  if (
    href === "/admin/calendar-sync/review" &&
    pathname.startsWith("/admin/calendar-sync")
  ) {
    return true;
  }
  return href !== "/admin" && pathname.startsWith(`${href}/`);
}

export function AdminSubNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      className="shrink-0 border-b border-border bg-background"
    >
      <div className="flex gap-6 overflow-x-auto px-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ADMIN_NAV.map((item) => {
          const isActive = isAdminNavActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "shrink-0 border-b-2 py-4 text-body transition-colors",
                isActive
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {item.label}
              {item.phase ? (
                <span className="ml-1.5 text-caption font-normal text-muted-foreground">
                  · Phase {item.phase}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

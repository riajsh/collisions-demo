import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  LayoutDashboard,
  Radar,
  Search,
  Settings2,
  Sparkles,
  Star,
  Users,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
  phase?: 2;
  adminOnly?: boolean;
};

/** Sidebar order matches docs/information-architecture.md */
export const MAIN_NAV: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Search", href: "/search", icon: Search },
  { label: "Watch List", href: "/watchlist", icon: Star, disabled: true, phase: 2 },
  { label: "Connect", href: "/connect", icon: Sparkles },
  { label: "Profiles", href: "/profiles", icon: Users },
  { label: "Orbit", href: "/orbit", icon: Radar },
  { label: "Events", href: "/events", icon: CalendarDays },
  { label: "Admin", href: "/admin", icon: Settings2, adminOnly: true },
];

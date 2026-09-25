export type AdminNavItem = {
  label: string;
  href: string;
  /** Shown on placeholder pages until the feature ships */
  phase?: 2;
};

export const ADMIN_NAV: AdminNavItem[] = [
  { label: "Overview", href: "/admin" },
  { label: "Calendar review", href: "/admin/calendar-sync/review" },
  { label: "Eventbrite events", href: "/admin/eventbrite/events" },
  { label: "Eventbrite review", href: "/admin/eventbrite/review" },
  { label: "Team Members", href: "/admin/team-members" },
  { label: "Connect Settings", href: "/admin/connect-settings", phase: 2 },
  { label: "Tags", href: "/admin/tags" },
  { label: "Dedup", href: "/admin/dedup" },
  { label: "Archived", href: "/admin/archived" },
];

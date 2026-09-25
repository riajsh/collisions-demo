export function formatInteractionDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** "5 days ago" style, for the header status line's "Last contact". */
export function formatRelativeDate(iso: string | null): string | null {
  if (!iso) {
    return null;
  }

  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  const diffDays = Math.round((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) {
    return "today";
  }
  if (diffDays === 1) {
    return "yesterday";
  }
  if (diffDays < 30) {
    return `${diffDays} days ago`;
  }
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
  }
  const diffYears = Math.round(diffMonths / 12);
  return `${diffYears} year${diffYears === 1 ? "" : "s"} ago`;
}

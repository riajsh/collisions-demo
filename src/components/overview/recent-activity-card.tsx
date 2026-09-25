import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatInteractionDate } from "@/lib/format/date";
import { formatEnumLabel } from "@/lib/format/enum";
import type { RecentActivityItem } from "@/lib/data/activities";

type RecentActivityCardProps = {
  activities: RecentActivityItem[];
  ownerUserId?: string;
  ownerName?: string;
};

export function RecentActivityCard({
  activities,
  ownerUserId,
  ownerName,
}: RecentActivityCardProps) {
  const profilesHref = ownerUserId ? `/profiles?owner=${ownerUserId}` : "/profiles";

  if (activities.length === 0) {
    return (
      <EmptyState
        variant="dashed"
        title="Recent activity"
        description={
          ownerName
            ? `No recent updates on ${ownerName}'s profiles yet. Log notes, calls, and event attendance from profile detail.`
            : "Manual notes, calls, introductions, and event attendance show here — not calendar invites."
        }
      >
        <Link
          href={profilesHref}
          className="text-caption text-interactive-primary hover:underline"
        >
          {ownerName ? `${ownerName}'s profiles →` : "Browse profiles →"}
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-subheading font-medium text-foreground">
          Recent activity
          {ownerName ? (
            <span className="text-muted-foreground"> · {ownerName}</span>
          ) : null}
        </p>
        <Link
          href={profilesHref}
          className="text-caption text-interactive-primary hover:underline"
        >
          {ownerName ? "Their profiles" : "All profiles"}
        </Link>
      </div>
      <ul className="mt-4 space-y-3">
        {activities.map((activity) => (
          <li key={activity.id}>
            <Link
              href={`/profiles/${activity.profileId}`}
              className="block rounded-md px-1 py-1 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body font-medium text-foreground">
                  {activity.profileName}
                </span>
                <Badge variant="outline">
                  {formatEnumLabel(activity.activityType)}
                </Badge>
                <span className="text-caption text-muted-foreground">
                  {formatInteractionDate(activity.activityDate)}
                </span>
              </div>
              <p className="text-body text-muted-foreground">{activity.title}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

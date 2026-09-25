import { Badge } from "@/components/ui/badge";
import { formatInteractionDate } from "@/lib/format/date";
import { formatEnumLabel } from "@/lib/format/enum";
import { PROFILE_ACTIVITY_LIMIT } from "@/lib/format/provenance";
import type { ProfileActivity } from "@/lib/data/profiles";

type ActivityTimelineProps = {
  activities: ProfileActivity[];
  truncated?: boolean;
};

export function ActivityTimeline({
  activities,
  truncated = false,
}: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
        <p className="text-subheading font-medium text-foreground">
          No activity yet
        </p>
        <p className="mt-2 text-body text-muted-foreground">
          Manual notes, meetings, email sync, and events will populate this
          timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {truncated ? (
        <p className="text-caption text-muted-foreground">
          Showing the {PROFILE_ACTIVITY_LIMIT} most recent activities.
        </p>
      ) : null}
      <ol className="space-y-4">
      {activities.map((activity) => (
        <li
          key={activity.id}
          className="rounded-lg border border-border bg-card px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <time
              dateTime={activity.activityDate}
              className="text-caption text-muted-foreground"
            >
              {formatInteractionDate(activity.activityDate)}
            </time>
            <Badge variant="outline">
              {formatEnumLabel(activity.activityType)}
            </Badge>
            {activity.introductionOutcome ? (
              <Badge variant="secondary">
                {formatEnumLabel(activity.introductionOutcome)}
              </Badge>
            ) : null}
            <Badge variant="secondary">{formatEnumLabel(activity.source)}</Badge>
          </div>
          <p className="mt-2 text-body font-medium text-foreground">
            {activity.title}
          </p>
          {activity.summary ? (
            <p className="mt-1 text-body text-muted-foreground">
              {activity.summary}
            </p>
          ) : null}
        </li>
      ))}
      </ol>
    </div>
  );
}

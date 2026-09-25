import { formatInteractionDate } from "@/lib/format/date";
import type { ProfileListItem } from "@/lib/data/profiles";

type LastInteractionDateCellProps = {
  profile: Pick<ProfileListItem, "lastInteractionAt" | "lastCalendarMeeting">;
};

export function LastInteractionDateCell({ profile }: LastInteractionDateCellProps) {
  const displayDate =
    profile.lastCalendarMeeting?.activityDate ?? profile.lastInteractionAt ?? null;

  if (!displayDate) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className="text-muted-foreground">{formatInteractionDate(displayDate)}</span>
  );
}

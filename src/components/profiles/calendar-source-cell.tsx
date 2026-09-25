import type { ProfileListItem } from "@/lib/data/profiles";

type CalendarSourceCellProps = {
  profile: Pick<ProfileListItem, "lastCalendarMeeting">;
};

export function CalendarSourceCell({ profile }: CalendarSourceCellProps) {
  const source = profile.lastCalendarMeeting?.calendarSource;

  if (!source) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span className="text-muted-foreground" title={source}>
      {source}
    </span>
  );
}

import { ownerColour } from "@/config/owner-colours";
import { truncateText } from "@/lib/format/person-initials";
import type { ProfileListItem } from "@/lib/data/profiles";

const MEETING_TITLE_MAX_LENGTH = 50;

type LastMeetingCellProps = {
  profile: Pick<ProfileListItem, "lastCalendarMeeting">;
};

export function LastMeetingCell({ profile }: LastMeetingCellProps) {
  const meeting = profile.lastCalendarMeeting;

  if (!meeting?.title) {
    return <span className="text-muted-foreground">—</span>;
  }

  const displayTitle = truncateText(meeting.title, MEETING_TITLE_MAX_LENGTH);
  const teamParticipants = meeting.teamParticipants ?? [];

  return (
    <div className="flex min-w-[12rem] max-w-[22rem] items-center gap-2 text-left">
      {teamParticipants.length > 0 ? (
        <div className="flex shrink-0 items-center gap-0.5">
          {teamParticipants.map((participant) => (
            <span
              key={`${participant.label}-${participant.initials}`}
              title={participant.label}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border bg-card text-[10px] font-medium leading-none text-foreground"
              style={{
                borderColor: participant.userId
                  ? ownerColour(participant.userId)
                  : "var(--color-border-default)",
              }}
            >
              {participant.initials}
            </span>
          ))}
        </div>
      ) : null}
      <span className="min-w-0 text-left text-muted-foreground" title={meeting.title}>
        {displayTitle}
      </span>
    </div>
  );
}

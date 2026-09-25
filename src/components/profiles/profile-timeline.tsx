"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatInteractionDate } from "@/lib/format/date";
import { PROFILE_ACTIVITY_LIMIT } from "@/lib/format/provenance";
import { buildProfileTimeline } from "@/lib/profiles/build-timeline";
import type { ProfileDetail } from "@/lib/data/profiles";
import type { OrgUser } from "@/lib/data/users";

import { LogActivityForm } from "./log-activity-form";

const COLLAPSED_COUNT = 5;

type ProfileTimelineProps = {
  profile: ProfileDetail;
  teamUsers: OrgUser[];
  currentUserId: string;
};

/**
 * Chronological feed of everything on this profile — events attended,
 * logged interactions, and self-reported notes — merged into single cards
 * per moment rather than split across separate Activity/Connections/Events
 * tabs. Collapsed to the most recent few by default so it doesn't push
 * everything else down the page; "Log activity" stays behind a button
 * instead of an always-open form.
 */
export function ProfileTimeline({
  profile,
  teamUsers,
  currentUserId,
}: ProfileTimelineProps) {
  const [expanded, setExpanded] = useState(false);
  const [isLogging, setIsLogging] = useState(false);

  const entries = buildProfileTimeline(profile);
  const visibleEntries = expanded ? entries : entries.slice(0, COLLAPSED_COUNT);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {profile.activitiesTruncated ? (
          <p className="text-caption text-muted-foreground">
            Showing the {PROFILE_ACTIVITY_LIMIT} most recent activities.
          </p>
        ) : (
          <span />
        )}
        <Button
          type="button"
          size="sm"
          variant={isLogging ? "outline" : "default"}
          onClick={() => setIsLogging((current) => !current)}
        >
          {isLogging ? "Cancel" : "Log activity"}
        </Button>
      </div>

      {isLogging ? (
        <LogActivityForm
          profileId={profile.id}
          teamUsers={teamUsers}
          currentUserId={currentUserId}
        />
      ) : null}

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
          <p className="text-subheading font-medium text-foreground">
            No activity yet
          </p>
          <p className="mt-2 text-body text-muted-foreground">
            Logged interactions, events attended, and self-reported notes
            will populate this timeline.
          </p>
        </div>
      ) : (
        <>
          <ol className="space-y-3">
            {visibleEntries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <time
                    dateTime={entry.date}
                    className="text-caption text-muted-foreground"
                  >
                    {formatInteractionDate(entry.date)}
                  </time>
                  <Badge variant={entry.tag === "Event" ? "secondary" : "outline"}>
                    {entry.tag}
                  </Badge>
                </div>
                <p className="mt-1 text-body font-medium text-foreground">
                  {entry.title}
                </p>
                {entry.detail ? (
                  <p className="mt-1 text-body text-muted-foreground">
                    {entry.detail}
                  </p>
                ) : null}
                {entry.secondaryDetail ? (
                  <p className="mt-1 rounded-md bg-muted/40 px-2 py-1 text-body text-foreground">
                    “{entry.secondaryDetail}”
                  </p>
                ) : null}
              </li>
            ))}
          </ol>

          {entries.length > COLLAPSED_COUNT ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Show fewer" : `Show full timeline (${entries.length})`}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

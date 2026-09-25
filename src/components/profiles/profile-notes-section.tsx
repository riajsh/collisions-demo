"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatInteractionDate } from "@/lib/format/date";
import type { ProfileNote } from "@/lib/data/profiles";

type ProfileNotesSectionProps = {
  notes: ProfileNote[];
};

/**
 * "Ask" — what this person has told us themselves, on event forms over
 * time (renamed from "Notes" to distinguish it from Relationship context,
 * which is our own read on them). Used to have its own local AI TL;DR
 * here — that's now consolidated into ProfileSummaryHero near the top of
 * the profile, so this section is just the raw list of self-reported asks.
 */
export function ProfileNotesSection({ notes }: ProfileNotesSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (notes.length === 0) {
    return null;
  }

  const visibleNotes = expanded ? notes : notes.slice(0, 3);

  return (
    <section className="space-y-3">
      <h2 className="text-heading font-medium text-foreground">Ask</h2>
      <p className="text-caption text-muted-foreground">
        What this person has told us themselves, in their own words, on event
        forms over time.
      </p>

      <ol className="space-y-3">
        {visibleNotes.map((note) => (
          <li
            key={note.id}
            className="rounded-lg border border-border bg-card px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <time
                dateTime={note.activityDate}
                className="text-caption text-muted-foreground"
              >
                {formatInteractionDate(note.activityDate)}
              </time>
              <Badge variant="outline">{note.eventTitle}</Badge>
            </div>
            <p className="mt-1 text-body text-foreground">{note.text}</p>
          </li>
        ))}
      </ol>

      {notes.length > 3 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show fewer notes" : `Show all ${notes.length} notes`}
        </Button>
      ) : null}
    </section>
  );
}

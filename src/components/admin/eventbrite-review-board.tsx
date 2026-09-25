"use client";

import { useMemo, useState } from "react";

import { EventbriteProfileUpdateRow } from "@/components/admin/eventbrite-profile-update-row";
import { EventbriteReviewList } from "@/components/admin/eventbrite-review-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import type { ProfileUpdateReviewRow } from "@/lib/data/eventbrite-profile-updates";
import type { EventbriteReviewRow as EventbriteReviewRowData } from "@/lib/data/eventbrite-reviews";

type EventGroup = {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  reviews: EventbriteReviewRowData[];
};

function matches(filter: string, ...values: Array<string | null | undefined>): boolean {
  if (!filter) {
    return true;
  }
  const needle = filter.trim().toLowerCase();
  return values.some((value) => value?.toLowerCase().includes(needle));
}

export function EventbriteReviewBoard({
  reviews,
  profileUpdates,
}: {
  reviews: EventbriteReviewRowData[];
  profileUpdates: ProfileUpdateReviewRow[];
}) {
  const [filterText, setFilterText] = useState("");

  const filteredReviews = useMemo(
    () =>
      reviews.filter((review) =>
        matches(filterText, review.eventTitle, review.displayName, review.email),
      ),
    [reviews, filterText],
  );

  const filteredProfileUpdates = useMemo(
    () =>
      profileUpdates.filter((update) =>
        matches(filterText, update.eventTitle, update.profileName),
      ),
    [profileUpdates, filterText],
  );

  const groups = useMemo<EventGroup[]>(() => {
    const byEvent = new Map<string, EventGroup>();
    for (const review of filteredReviews) {
      const existing = byEvent.get(review.eventId);
      if (existing) {
        existing.reviews.push(review);
      } else {
        byEvent.set(review.eventId, {
          eventId: review.eventId,
          eventTitle: review.eventTitle,
          eventDate: review.eventDate,
          reviews: [review],
        });
      }
    }
    return Array.from(byEvent.values()).sort(
      (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime(),
    );
  }, [filteredReviews]);

  const hasAnyData = reviews.length > 0 || profileUpdates.length > 0;

  return (
    <div className="space-y-6">
      {hasAnyData ? (
        <Input
          value={filterText}
          onChange={(event) => setFilterText(event.target.value)}
          placeholder="Filter by event, attendee, or profile name…"
          className="w-full sm:max-w-sm"
        />
      ) : null}

      {groups.length > 0 ? (
        <div className="space-y-6">
          {groups.map((group) => {
            const eventDate = new Date(group.eventDate).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
            return (
              <div key={group.eventId} className="space-y-2">
                <h3 className="text-body font-medium text-foreground">
                  {group.eventTitle}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {eventDate} · {group.reviews.length} pending
                  </span>
                </h3>
                <EventbriteReviewList reviews={group.reviews} />
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          variant="dashed"
          title="Nothing to review"
          description={
            reviews.length === 0
              ? "Unmatched Eventbrite attendees will show up here."
              : "No matches — try a different filter."
          }
        />
      )}

      <div className="space-y-3 pt-4">
        <h2 className="text-heading font-medium text-foreground">Possible updates</h2>
        <p className="text-body text-muted-foreground">
          Attendees who already have a profile, but whose Eventbrite answers
          this time don&apos;t match what&apos;s on file — a role change, new
          company, or similar.
        </p>
        {filteredProfileUpdates.length === 0 ? (
          <EmptyState
            variant="dashed"
            title="Nothing to review"
            description={
              profileUpdates.length === 0
                ? "Profile changes spotted from Eventbrite answers will show up here."
                : "No matches — try a different filter."
            }
          />
        ) : (
          <div className="space-y-2">
            {filteredProfileUpdates.map((update) => (
              <EventbriteProfileUpdateRow key={update.id} review={update} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

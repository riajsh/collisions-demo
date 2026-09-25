"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  addEventAttendeesBulkAction,
  searchProfilesForPickerAction,
} from "@/app/(app)/events/actions";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProfilePickerOption } from "@/lib/data/profiles";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

type AddEventAttendeeFormProps = {
  eventId: string;
  existingProfileIds: string[];
};

export function AddEventAttendeeForm({
  eventId,
  existingProfileIds,
}: AddEventAttendeeFormProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending: isSubmitting, run: runSubmit } = useAsyncAction();
  const { isPending: isSearching, run: runSearch } = useAsyncAction();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfilePickerOption[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<ProfilePickerOption[]>(
    [],
  );
  const [tagWithEvent, setTagWithEvent] = useState(false);
  const searchTimeoutRef = useRef<number | null>(null);
  const listboxId = useId();
  const selectedIds = selectedProfiles.map((profile) => profile.id);
  const showResults = results.length > 0;

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);

    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current);
    }

    if (value.trim().length < 2) {
      setResults([]);
      return;
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      void runSearch(async () => {
        const response = await searchProfilesForPickerAction(value);
        if (response.error) {
          await alert({
            title: "Search failed",
            description: response.error,
          });
          return;
        }

        setResults(
          response.results.filter(
            (profile) =>
              !existingProfileIds.includes(profile.id) &&
              !selectedIds.includes(profile.id),
          ),
        );
      });
    }, 250);
  }

  function addProfile(profile: ProfilePickerOption) {
    setSelectedProfiles((current) => [...current, profile]);
    setResults((current) => current.filter((item) => item.id !== profile.id));
  }

  function removeProfile(profileId: string) {
    setSelectedProfiles((current) =>
      current.filter((profile) => profile.id !== profileId),
    );
  }

  return (
    <form
      action={(formData) => {
        void runSubmit(async () => {
          if (selectedProfiles.length === 0) {
            await alert({
              title: "Select at least one profile",
              description: "Search above and choose the people you want to add.",
            });
            return;
          }

          const result = await addEventAttendeesBulkAction(formData);
          if ("error" in result && result.error) {
            await alert({ title: "Could not add attendees", description: result.error });
            return;
          }

          if (!("success" in result)) {
            return;
          }

          if (result.tagWarning) {
            await alert({ title: "Attendees added", description: result.tagWarning });
          } else {
            toastSuccess(
              tagWithEvent && result.tagged
                ? `Added ${result.added} attendee${result.added === 1 ? "" : "s"} and tagged ${result.tagged}`
                : `Added ${result.added} attendee${result.added === 1 ? "" : "s"}`,
            );
          }

          setQuery("");
          setResults([]);
          setSelectedProfiles([]);
          router.refresh();
        });
      }}
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <p className="text-subheading font-medium text-foreground">Add attendees</p>
      <input type="hidden" name="eventId" value={eventId} />
      {selectedProfiles.map((profile) => (
        <input key={profile.id} type="hidden" name="profileIds" value={profile.id} />
      ))}

      <div className="space-y-2">
        <Label htmlFor="attendee-search">Search profiles</Label>
        <Input
          id="attendee-search"
          role="combobox"
          aria-expanded={showResults}
          aria-controls={listboxId}
          aria-autocomplete="list"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Name, company, or email…"
          autoComplete="off"
        />
      </div>

      {selectedProfiles.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selectedProfiles.map((profile) => (
            <li
              key={profile.id}
              className="flex items-center gap-2 rounded-full border border-border bg-muted/40 py-1 pl-3 pr-1 text-body text-foreground"
            >
              <span>{profile.fullName}</span>
              <button
                type="button"
                onClick={() => removeProfile(profile.id)}
                className="rounded-full px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${profile.fullName}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showResults ? (
        <ul
          id={listboxId}
          role="listbox"
          className="max-h-48 overflow-auto rounded-md border border-border"
        >
          {results.map((profile) => (
            <li key={profile.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted/50"
                onClick={() => addProfile(profile)}
              >
                <span className="text-body font-medium text-foreground">
                  {profile.fullName}
                </span>
                {profile.organisationName ? (
                  <span className="text-caption text-muted-foreground">
                    {profile.organisationName}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <label className="flex items-center gap-2 text-body text-foreground">
        <input
          type="checkbox"
          name="tagWithEvent"
          value="true"
          checked={tagWithEvent}
          onChange={(event) => setTagWithEvent(event.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <span>Also tag them with this event&rsquo;s name</span>
      </label>

      <Button
        type="submit"
        disabled={isSubmitting || isSearching || selectedProfiles.length === 0}
        className="w-fit"
      >
        {isSubmitting
          ? "Adding…"
          : selectedProfiles.length > 0
            ? `Add ${selectedProfiles.length} attendee${selectedProfiles.length === 1 ? "" : "s"}`
            : "Add attendees"}
      </Button>
    </form>
  );
}

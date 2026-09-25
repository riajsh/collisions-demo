"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  resolveEventbriteReviewAction,
  searchProfilesForEventbriteLinkAction,
} from "@/app/(app)/admin/eventbrite/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { EventbriteReviewRow as EventbriteReviewRowData } from "@/lib/data/eventbrite-reviews";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

type ProfileMatch = { id: string; fullName: string; email: string | null };

export function EventbriteReviewRow({
  review,
  fullName,
  email,
  role,
  organisationName,
  onFullNameChange,
  onEmailChange,
  onRoleChange,
  onOrganisationNameChange,
  selected,
  onToggleSelected,
}: {
  review: EventbriteReviewRowData;
  fullName: string;
  email: string;
  role: string;
  organisationName: string;
  onFullNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onOrganisationNameChange: (value: string) => void;
  selected: boolean;
  onToggleSelected: (value: boolean) => void;
}) {
  const router = useRouter();
  const { isPending, run } = useAsyncAction();
  const [query, setQuery] = useState(review.email);
  const [results, setResults] = useState<ProfileMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    setSearching(true);
    try {
      const result = await searchProfilesForEventbriteLinkAction(query);
      setResults(result.results);
    } finally {
      setSearching(false);
    }
  }

  function submitResolution(action: "link" | "create" | "ignore", profileId?: string) {
    void run(async () => {
      setError(null);
      const formData = new FormData();
      formData.set("reviewId", review.id);
      formData.set("action", action);
      if (profileId) {
        formData.set("profileId", profileId);
      }
      if (action === "create") {
        formData.set("fullName", fullName);
        formData.set("email", email);
        if (role) {
          formData.set("role", role);
        }
        if (organisationName) {
          formData.set("organisationName", organisationName);
        }
      }
      const result = await resolveEventbriteReviewAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      toastSuccess(
        action === "ignore"
          ? "Ignored"
          : action === "create"
            ? "Profile created and added"
            : "Linked and added",
      );
      router.refresh();
    });
  }

  const eventDate = new Date(review.eventDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={(value) => onToggleSelected(value === true)}
          aria-label={`Select ${fullName || review.email}`}
          className="mt-0.5"
        />
        <p className="text-caption text-muted-foreground">
          {review.ticketType ? `${review.ticketType} · ` : ""}
          {review.eventTitle} · {eventDate}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-caption text-muted-foreground" htmlFor={`name-${review.id}`}>
            Name
          </label>
          <Input
            id={`name-${review.id}`}
            value={fullName}
            onChange={(event) => onFullNameChange(event.target.value)}
            placeholder="Full name"
            className="w-full sm:w-56"
          />
        </div>
        <div className="space-y-1">
          <label className="text-caption text-muted-foreground" htmlFor={`email-${review.id}`}>
            Email
          </label>
          <Input
            id={`email-${review.id}`}
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="Email"
            className="w-full sm:w-64"
          />
        </div>
        <div className="space-y-1">
          <label className="text-caption text-muted-foreground" htmlFor={`role-${review.id}`}>
            Role
          </label>
          <Input
            id={`role-${review.id}`}
            value={role}
            onChange={(event) => onRoleChange(event.target.value)}
            placeholder="Role"
            className="w-full sm:w-48"
          />
        </div>
        <div className="space-y-1">
          <label
            className="text-caption text-muted-foreground"
            htmlFor={`organisation-${review.id}`}
          >
            Company
          </label>
          <Input
            id={`organisation-${review.id}`}
            value={organisationName}
            onChange={(event) => onOrganisationNameChange(event.target.value)}
            placeholder="Company"
            className="w-full sm:w-48"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search existing profiles by name or email"
          className="w-full sm:w-72"
        />
        <Button type="button" variant="outline" disabled={searching} onClick={handleSearch}>
          {searching ? "Searching…" : "Search"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => submitResolution("create")}
        >
          Create new profile
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={isPending}
          onClick={() => submitResolution("ignore")}
        >
          Ignore
        </Button>
      </div>

      {results.length > 0 ? (
        <ul className="space-y-1">
          {results.map((profile) => (
            <li key={profile.id} className="flex items-center justify-between gap-2">
              <span className="text-body text-foreground">
                {profile.fullName}
                {profile.email ? (
                  <span className="text-muted-foreground"> · {profile.email}</span>
                ) : null}
              </span>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={() => submitResolution("link", profile.id)}
              >
                Link
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

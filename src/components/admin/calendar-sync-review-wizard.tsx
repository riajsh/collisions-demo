"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  clearColleagueCalendarSyncNoiseAction,
  createProfileFromCalendarReviewAction,
  deleteCalendarReviewAction,
  deleteUnownedPersonalEmailProfilesAction,
  ignoreAllInternalCalendarReviewsAction,
  ignoreCalendarReviewAction,
  ignoreSingleMeetingCalendarReviewsAction,
  ignoreUnownedPersonalEmailReviewsAction,
  linkCalendarReviewAction,
  searchProfilesForCalendarLinkAction,
} from "@/app/(app)/admin/calendar-sync/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  CalendarMatchedMeeting,
  CalendarMatchedMeetingLists,
  CalendarProfileMatch,
  CalendarReviewGroupLists,
  CalendarSyncReviewSummary,
  CalendarUnmatchedGroup,
} from "@/lib/data/calendar-sync-review";
import { formatInteractionDate } from "@/lib/format/date";
import {
  companySuggestionLabel,
  ownerSuggestionLabel,
} from "@/lib/enrichment/labels";
import type { OrgUser } from "@/lib/data/users";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

type CalendarSyncReviewWizardProps = {
  summary: CalendarSyncReviewSummary;
  unmatchedGroups: CalendarReviewGroupLists;
  matchedMeetings: CalendarMatchedMeetingLists;
  teamUsers: OrgUser[];
};

function formatMeetingContext(group: CalendarUnmatchedGroup): string {
  if (group.meetingCount === 1 && group.sampleMeetingTitle) {
    return `${group.sampleMeetingTitle}${
      group.sampleMeetingDate
        ? ` · ${formatInteractionDate(group.sampleMeetingDate)}`
        : ""
    }`;
  }

  return `${group.meetingCount} meetings${
    group.sampleMeetingTitle ? ` · e.g. ${group.sampleMeetingTitle}` : ""
  }`;
}

function defaultLinkSearchQuery(group: CalendarUnmatchedGroup): string {
  if (group.displayName?.trim()) {
    return group.displayName.trim();
  }

  const localPart = group.email.split("@")[0] ?? "";
  return localPart.length >= 2 ? localPart : "";
}

function InternalReviewRow({ group }: { group: CalendarUnmatchedGroup }) {
  const router = useRouter();
  const { confirm } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [error, setError] = useState<string | null>(null);

  async function runDelete() {
    const confirmed = await confirm({
      title: "Delete review records?",
      description:
        "Permanently removes pending review rows for this email. Unlike Ignore, they are not remembered — the next calendar sync may add this person back for review again.",
      confirmLabel: "Delete",
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    void run(async () => {
      setError(null);
      const formData = new FormData();
      formData.set("email", group.email);
      const result = await deleteCalendarReviewAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      toastSuccess("Review deleted");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-muted/20 px-4 py-3">
      <div>
        <p className="text-body font-medium text-foreground">
          {group.displayName ?? group.email}
        </p>
        <p className="text-caption text-muted-foreground">{group.email}</p>
        <p className="text-caption text-muted-foreground">
          {formatMeetingContext(group)}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          void run(async () => {
            setError(null);
            const formData = new FormData();
            formData.set("email", group.email);
            const result = await ignoreCalendarReviewAction(formData);
            if (result.error) {
              setError(result.error);
              return;
            }
            toastSuccess("Review ignored");
            router.refresh();
          });
        }}
      >
        Ignore
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        className="text-destructive hover:text-destructive"
        onClick={() => {
          void runDelete();
        }}
      >
        Delete
      </Button>
      {error ? (
        <p className="text-body text-destructive" role="alert">{error}</p>
      ) : null}
    </div>
  );
}

function UnmatchedReviewRow({
  group,
  teamUsers,
}: {
  group: CalendarUnmatchedGroup;
  teamUsers: OrgUser[];
}) {
  const router = useRouter();
  const { confirm } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [error, setError] = useState<string | null>(null);
  const initialQuery = defaultLinkSearchQuery(group);
  const [linkQuery, setLinkQuery] = useState(initialQuery);
  const [linkExpanded, setLinkExpanded] = useState(false);
  const [fullName, setFullName] = useState(
    group.displayName?.trim() ||
      (group.email.split("@")[0] ?? "").replace(/[._+-]/g, " ").trim(),
  );
  const [organisationName, setOrganisationName] = useState(
    () => group.suggestedCompany?.name ?? "",
  );
  const [occupation, setOccupation] = useState("");
  const [ownerUserId, setOwnerUserId] = useState(
    () => group.suggestedOwner?.userId ?? "",
  );
  const [candidates, setCandidates] = useState<CalendarProfileMatch[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const runSearch = useCallback(
    async (query: string) => {
      setIsSearching(true);
      setError(null);

      const result = await searchProfilesForCalendarLinkAction(
        query,
        group.email,
      );

      setIsSearching(false);
      setHasSearched(true);

      if (result.error) {
        setError(result.error);
        setCandidates([]);
        setSelectedProfileId(null);
        return;
      }

      setCandidates(result.profiles);
      const exactMatch = result.profiles.find(
        (profile) => profile.matchReason === "exact_email",
      );
      setSelectedProfileId(exactMatch?.id ?? result.profiles[0]?.id ?? null);
    },
    [group.email],
  );

  useEffect(() => {
    if (!linkExpanded) {
      return;
    }

    const timer = window.setTimeout(() => {
      void runSearch(linkQuery);
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [linkExpanded, linkQuery, runSearch]);

  function runAction(
    action: () => Promise<{ error?: string }>,
    successMessage: string,
  ) {
    void run(async () => {
      setError(null);
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      toastSuccess(successMessage);
      router.refresh();
    });
  }

  async function runDelete() {
    const confirmed = await confirm({
      title: "Delete review records?",
      description:
        "Permanently removes pending review rows for this email. Unlike Ignore, they are not remembered — the next calendar sync may add this person back for review again.",
      confirmLabel: "Delete",
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    const formData = new FormData();
    formData.set("email", group.email);
    runAction(() => deleteCalendarReviewAction(formData), "Review deleted");
  }

  const selectedProfile = candidates.find(
    (candidate) => candidate.id === selectedProfileId,
  );
  const suggestedCompanyValue =
    organisationName &&
    group.suggestedCompanies.includes(organisationName)
      ? organisationName
      : "";

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Not in Ecosystem</Badge>
          <span className="text-caption text-muted-foreground">
            {group.meetingCount}{" "}
            {group.meetingCount === 1 ? "meeting" : "meetings"}
          </span>
        </div>
        <p className="text-body font-medium text-foreground">{group.email}</p>
        {group.displayName ? (
          <p className="text-caption text-muted-foreground">
            Name on Google Calendar: {group.displayName}
          </p>
        ) : null}
        <p className="text-caption text-muted-foreground">
          {formatMeetingContext(group)}
        </p>
      </div>

      <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
        <div>
          <p className="text-body font-medium text-foreground">
            Create new profile
          </p>
          <p className="text-caption text-muted-foreground">
            Add name, company and role now if you know them — saves triage later.
          </p>
        </div>
        <div className="grid gap-3">
          <Input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Name"
            aria-label={`Name for ${group.email}`}
          />
          <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            {group.suggestedCompanies.length > 0 ? (
              <>
                <Select
                  value={suggestedCompanyValue}
                  onValueChange={setOrganisationName}
                >
                  <SelectTrigger
                    aria-label={`Suggested companies for ${group.email}`}
                  >
                    <SelectValue placeholder="Suggested from email domain" />
                  </SelectTrigger>
                  <SelectContent>
                    {group.suggestedCompanies.map((company) => (
                      <SelectItem key={company} value={company}>
                        {company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-caption text-muted-foreground">
                  From other profiles with @{group.email.split("@")[1]} emails.
                </p>
              </>
            ) : group.suggestedCompany ? (
              <p className="text-caption text-muted-foreground">
                {companySuggestionLabel(group.suggestedCompany)}
              </p>
            ) : null}
            <Input
              value={organisationName}
              onChange={(event) => setOrganisationName(event.target.value)}
              placeholder="Company"
              aria-label={`Company for ${group.email}`}
            />
          </div>
          <div className="space-y-2">
            <Select
              value={ownerUserId || undefined}
              onValueChange={setOwnerUserId}
            >
              <SelectTrigger aria-label={`Suggested owner for ${group.email}`}>
                <SelectValue placeholder="Suggested owner" />
              </SelectTrigger>
              <SelectContent>
                {teamUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {group.suggestedOwner ? (
              <p className="text-caption text-muted-foreground">
                {ownerSuggestionLabel(group.suggestedOwner)}
              </p>
            ) : (
              <p className="text-caption text-muted-foreground">
                Optional — assign a relationship owner now.
              </p>
            )}
          </div>
          </div>
          <Input
            value={occupation}
            onChange={(event) => setOccupation(event.target.value)}
            placeholder="Role / title"
            aria-label={`Role for ${group.email}`}
          />
        </div>
      </div>

      <details
        className="rounded-md border border-border bg-muted/20 p-4"
        onToggle={(event) => {
          setLinkExpanded((event.currentTarget as HTMLDetailsElement).open);
        }}
      >
        <summary className="cursor-pointer text-body font-medium text-foreground">
          Link to someone already in Ecosystem
        </summary>
        <div className="mt-4 space-y-3">
          <p className="text-caption text-muted-foreground">
            Only needed if this person uses a different email in Ecosystem.
            Sync already checked {group.email} — no match on file.
          </p>

          <Input
            value={linkQuery}
            onChange={(event) => setLinkQuery(event.target.value)}
            placeholder="Search by name…"
            aria-label={`Search profiles to link ${group.email}`}
          />

          {isSearching ? (
            <p className="text-caption text-muted-foreground">Searching…</p>
          ) : null}

          {!isSearching && hasSearched && candidates.length > 0 ? (
            <div className="space-y-2">
              <p className="text-caption font-medium text-muted-foreground">
                Possible matches
              </p>
              <div className="space-y-2">
                {candidates.map((candidate) => {
                  const isSelected = selectedProfileId === candidate.id;

                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => setSelectedProfileId(candidate.id)}
                      className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-body font-medium text-foreground">
                          {candidate.fullName}
                        </p>
                        {candidate.matchReason === "exact_email" ? (
                          <Badge variant="secondary">Same email</Badge>
                        ) : null}
                      </div>
                      {candidate.email ? (
                        <p className="text-caption text-muted-foreground">
                          {candidate.email}
                        </p>
                      ) : (
                        <p className="text-caption text-muted-foreground">
                          No email on profile
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending || !selectedProfileId}
                  onClick={() => {
                    if (!selectedProfileId) {
                      return;
                    }
                    const formData = new FormData();
                    formData.set("email", group.email);
                    formData.set("profileId", selectedProfileId);
                    runAction(
                      () => linkCalendarReviewAction(formData),
                      `Linked to ${selectedProfile?.fullName ?? "profile"}`,
                    );
                  }}
                >
                  Link to {selectedProfile?.fullName ?? "selected profile"}
                </Button>
                {selectedProfile ? (
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link
                      href={`/profiles/${selectedProfile.id}`}
                      target="_blank"
                    >
                      Preview profile
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!isSearching && hasSearched && candidates.length === 0 ? (
            <p className="text-body text-muted-foreground">
              {linkQuery.trim() || initialQuery
                ? `No profiles matched “${linkQuery.trim() || initialQuery}”.`
                : "Enter a name to search."}
            </p>
          ) : null}
        </div>
      </details>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() => {
            const formData = new FormData();
            formData.set("email", group.email);
            formData.set("displayName", fullName.trim());
            formData.set("organisationName", organisationName);
            formData.set("occupation", occupation);
            if (ownerUserId) {
              formData.set("ownerUserId", ownerUserId);
            }
            runAction(
              () => createProfileFromCalendarReviewAction(formData),
              "Profile created",
            );
          }}
        >
          Create new profile
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            const formData = new FormData();
            formData.set("email", group.email);
            runAction(
              () => ignoreCalendarReviewAction(formData),
              "Review ignored",
            );
          }}
        >
          Ignore
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          className="text-destructive hover:text-destructive"
          onClick={() => {
            void runDelete();
          }}
        >
          Delete
        </Button>
      </div>

      {error ? (
        <p className="text-body text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PersonalEmailCleanupSection({
  pendingReviewCount,
}: {
  pendingReviewCount: number;
}) {
  const router = useRouter();
  const { alert, confirm } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <p className="text-body font-medium text-foreground">
        Personal email noise
      </p>
      <p className="mt-1 text-body text-muted-foreground">
        Colleague calendars pull in gmail.com and similar addresses from other
        people&apos;s meetings. Clear the review list, remove auto-created
        personal-email profiles, and stop syncing colleague calendars.
        Profiles with a relationship owner are always kept.
        {pendingReviewCount > 0
          ? ` ${pendingReviewCount} people still waiting for review.`
          : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() => {
            void run(async () => {
              setError(null);
              const confirmed = await confirm({
                title: "Remove personal-email profiles?",
                description:
                  "Deletes profiles on gmail.com, hotmail.com, and similar domains that have no relationship owner. Calendar activities on those profiles are removed too. Profiles with an owner are kept.",
                confirmLabel: "Remove profiles",
                destructive: true,
              });
              if (!confirmed) {
                return;
              }

              const result = await deleteUnownedPersonalEmailProfilesAction();
              if ("error" in result && result.error) {
                setError(result.error);
                await alert({
                  title: "Could not remove profiles",
                  description: result.error,
                });
                return;
              }
              if (!("success" in result)) {
                return;
              }

              toastSuccess(
                `Removed ${result.deletedCount} personal-email profile${result.deletedCount === 1 ? "" : "s"}`,
              );
              router.refresh();
            });
          }}
        >
          Remove personal-email profiles
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isPending}
          onClick={() => {
            void run(async () => {
              setError(null);
              const result = await clearColleagueCalendarSyncNoiseAction();
              if ("error" in result && result.error) {
                setError(result.error);
                return;
              }
              if (!("success" in result)) {
                return;
              }
              toastSuccess(
                `Removed ${result.removedCalendars} colleague calendars · ignored ${result.ignoredReviewCount} personal-email reviews`,
              );
              router.refresh();
            });
          }}
        >
          Clear colleague sync noise
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            void run(async () => {
              setError(null);
              const result = await ignoreSingleMeetingCalendarReviewsAction();
              if ("error" in result && result.error) {
                setError(result.error);
                return;
              }
              if (!("success" in result)) {
                return;
              }
              toastSuccess(
                `Ignored ${result.reviewCount} single-meeting contacts (${result.ignoredEmails} emails)`,
              );
              router.refresh();
            });
          }}
        >
          Ignore one-meeting contacts
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            void run(async () => {
              setError(null);
              const result = await ignoreUnownedPersonalEmailReviewsAction();
              if ("error" in result && result.error) {
                setError(result.error);
                return;
              }
              if (!("success" in result)) {
                return;
              }
              toastSuccess(
                `Ignored ${result.reviewCount} reviews across ${result.ignoredEmails} personal emails`,
              );
              router.refresh();
            });
          }}
        >
          Ignore personal emails only
        </Button>
      </div>
      {error ? (
        <p className="mt-2 text-body text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TeamReviewSection({ groups }: { groups: CalendarUnmatchedGroup[] }) {
  const router = useRouter();
  const { isPending, run } = useAsyncAction();
  const [error, setError] = useState<string | null>(null);

  if (groups.length === 0) {
    return null;
  }

  return (
    <details className="rounded-lg border border-border bg-muted/20 p-4">
      <summary className="cursor-pointer text-body font-medium text-foreground">
        Team ({groups.length})
      </summary>
      <div className="mt-4 space-y-3">
        <p className="text-body text-muted-foreground">
          Internal addresses from before the filter was applied. Ignore to
          clear this list — future syncs skip them automatically.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            void run(async () => {
              setError(null);
              const result = await ignoreAllInternalCalendarReviewsAction();
              if (result.error) {
                setError(result.error);
                return;
              }
              toastSuccess("Team reviews ignored");
              router.refresh();
            });
          }}
        >
          Ignore all team
        </Button>
        <div className="space-y-2">
          {groups.map((group) => (
            <InternalReviewRow key={group.email} group={group} />
          ))}
        </div>
        {error ? (
          <p className="text-body text-destructive" role="alert">{error}</p>
        ) : null}
      </div>
    </details>
  );
}

function MatchedMeetingsTable({ meetings }: { meetings: CalendarMatchedMeeting[] }) {
  if (meetings.length === 0) {
    return (
      <p className="text-body text-muted-foreground">
        No meeting activities in this section.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-body">
        <thead className="border-b border-border bg-muted/40 text-caption text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Meeting</th>
            <th className="px-4 py-3 font-medium">Profile</th>
            <th className="px-4 py-3 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {meetings.map((meeting) => (
            <tr key={meeting.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3">{meeting.title}</td>
              <td className="px-4 py-3">
                <Link
                  href={`/profiles/${meeting.profileId}`}
                  className="hover:underline"
                >
                  {meeting.profileName}
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatInteractionDate(meeting.activityDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CalendarSyncReviewWizard({
  summary,
  unmatchedGroups,
  matchedMeetings,
  teamUsers,
}: CalendarSyncReviewWizardProps) {
  const defaultTab =
    summary.pendingReviewCount > 0 ? "review" : "matched";

  return (
    <Tabs defaultValue={defaultTab} className="space-y-6">
      <TabsList>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="review">
          Review people ({summary.pendingReviewCount})
        </TabsTrigger>
        <TabsTrigger value="matched">
          Matched meetings ({summary.matchedMeetingCount})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="summary" className="space-y-4">
        {summary.syncing ? (
          <p className="rounded-lg border border-border bg-card p-4 text-body text-foreground">
            Still running in the background. Refresh this page in a minute to
            see updated results.
          </p>
        ) : null}

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <dt className="text-caption text-muted-foreground">Calendar</dt>
            <dd className="text-subheading font-medium">
              {summary.accountEmail ?? "Not connected"}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <dt className="text-caption text-muted-foreground">Meetings pulled</dt>
            <dd className="text-subheading font-medium">
              {summary.eventsProcessed}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <dt className="text-caption text-muted-foreground">
              External profiles matched
            </dt>
            <dd className="text-subheading font-medium">
              {summary.matchedMeetingCount}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <dt className="text-caption text-muted-foreground">Need review</dt>
            <dd className="text-subheading font-medium">
              {summary.pendingReviewCount}
            </dd>
          </div>
        </dl>

        {summary.internalPendingReviewCount > 0 ||
        summary.internalMatchedMeetingCount > 0 ? (
          <p className="text-caption text-muted-foreground">
            {summary.internalPendingReviewCount > 0
              ? `${summary.internalPendingReviewCount} team addresses are waiting for review (see collapsed section on Review people). `
              : ""}
            {summary.internalMatchedMeetingCount > 0
              ? `${summary.internalMatchedMeetingCount} matched meetings are on internal profiles (see Matched meetings tab).`
              : ""}
          </p>
        ) : null}

        <p className="text-body text-muted-foreground">
          {summary.pendingReviewCount > 0
            ? "Work through external attendees who still need a decision — typically people with only a first name or no name on Google Calendar. Link to someone you already know, create a profile, or ignore no-replies and vendors."
            : "Everything external from this sync is matched. Check matched meetings or return to Admin."}
        </p>
      </TabsContent>

      <TabsContent value="review" id="review-tab" className="space-y-4">
        <PersonalEmailCleanupSection
          pendingReviewCount={summary.pendingReviewCount}
        />
        {unmatchedGroups.external.length === 0 ? (
          <p className="text-body text-muted-foreground">
            No external attendees left to review.
          </p>
        ) : (
          <>
            <p className="text-body text-muted-foreground">
              Each card is someone not yet in Ecosystem. Create a profile, expand
              “Link to someone already in Ecosystem” only if they might exist under
              a different email, or ignore vendors and no-replies.
            </p>
            <div className="space-y-4">
              {unmatchedGroups.external.map((group) => (
                <UnmatchedReviewRow
                  key={group.email}
                  group={group}
                  teamUsers={teamUsers}
                />
              ))}
            </div>
          </>
        )}

        <TeamReviewSection groups={unmatchedGroups.internal} />
      </TabsContent>

      <TabsContent value="matched" className="space-y-4">
        {matchedMeetings.external.length === 0 &&
        matchedMeetings.internal.length === 0 ? (
          <p className="text-body text-muted-foreground">
            No meeting activities were created yet.
          </p>
        ) : (
          <>
            <MatchedMeetingsTable meetings={matchedMeetings.external} />
            {matchedMeetings.internal.length > 0 ? (
              <details className="rounded-lg border border-border bg-muted/20 p-4">
                <summary className="cursor-pointer text-body font-medium text-foreground">
                  Team profiles ({matchedMeetings.internal.length})
                </summary>
                <div className="mt-4 space-y-3">
                  <p className="text-body text-muted-foreground">
                    Meetings matched to internal addresses from earlier syncs.
                    These are not part of the external relationship graph.
                  </p>
                  <MatchedMeetingsTable meetings={matchedMeetings.internal} />
                </div>
              </details>
            ) : null}
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}

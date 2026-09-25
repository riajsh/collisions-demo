import "server-only";

import type { calendar_v3 } from "googleapis";

import { isNonPersonParticipant } from "@/lib/integrations/participant-email";

export type SyncableCalendar = {
  id: string;
  summary: string | null;
  accessRole: string | null;
};

export type SubscribedCalendarOption = SyncableCalendar & {
  kind: "primary" | "room" | "colleague" | "holiday" | "other" | "ignored";
  recommended: boolean;
  readable: boolean;
};

function loadSyncCalendarDomains(): Set<string> {
  const raw = process.env.CALENDAR_SYNC_DOMAINS ?? process.env.ORG_INTERNAL_EMAIL_DOMAINS ?? "";
  return new Set(
    raw
      .split(",")
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean),
  );
}

function loadIgnorePatterns(): string[] {
  const raw =
    process.env.CALENDAR_SYNC_IGNORE_SUBSTRINGS ?? "31 crummer,31_crummer";
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

/** Calendars excluded from auto-sync and default backfill selection (e.g. 31 Crummer rooms). */
export function shouldExcludeCalendar(
  calendarId: string,
  summary: string | null,
): boolean {
  const haystack = `${calendarId} ${summary ?? ""}`.toLowerCase();
  return loadIgnorePatterns().some((pattern) => haystack.includes(pattern));
}

/** Colleague calendars on the org internal domain — not the connected user's own calendar. */
export function isColleagueCalendarId(
  calendarId: string,
  accountEmail: string,
): boolean {
  const normalisedId = calendarId.trim().toLowerCase();
  const normalisedAccountEmail = accountEmail.trim().toLowerCase();

  if (normalisedId === "primary" || normalisedId === normalisedAccountEmail) {
    return false;
  }

  if (normalisedId.endsWith("@resource.calendar.google.com")) {
    return false;
  }

  return shouldSyncCalendarId(calendarId, accountEmail);
}

function isRecommendedForBackfill(
  calendarId: string,
  accountEmail: string,
  summary: string | null,
): boolean {
  if (shouldExcludeCalendar(calendarId, summary)) {
    return false;
  }

  const normalisedId = calendarId.trim().toLowerCase();
  const normalisedAccountEmail = accountEmail.trim().toLowerCase();

  if (normalisedId === "primary" || normalisedId === normalisedAccountEmail) {
    return true;
  }

  return normalisedId.endsWith("@resource.calendar.google.com");
}

/** Whether a calendarList entry should be synced for this connected account. */
export function shouldSyncCalendarId(
  calendarId: string,
  accountEmail: string,
  summary: string | null = null,
): boolean {
  if (shouldExcludeCalendar(calendarId, summary)) {
    return false;
  }

  const normalisedId = calendarId.trim().toLowerCase();
  const normalisedAccountEmail = accountEmail.trim().toLowerCase();

  if (normalisedId === "primary" || normalisedId === normalisedAccountEmail) {
    return true;
  }

  if (normalisedId.endsWith("@resource.calendar.google.com")) {
    return true;
  }

  const domains = loadSyncCalendarDomains();
  for (const domain of domains) {
    if (normalisedId.endsWith(`@${domain}`)) {
      return true;
    }
  }

  return false;
}

function isReadableCalendar(entry: calendar_v3.Schema$CalendarListEntry): boolean {
  if (!entry.id || entry.hidden) {
    return false;
  }

  if (entry.accessRole === "freeBusyReader") {
    return false;
  }

  // Skip public holiday and birthday feeds — not relationship evidence.
  if (entry.id.includes("@group.v.calendar.google.com")) {
    return false;
  }

  if (entry.id.includes("#contacts@group.v.calendar.google.com")) {
    return false;
  }

  return true;
}

export async function listSyncableCalendars(
  calendar: calendar_v3.Calendar,
  accountEmail: string,
): Promise<SyncableCalendar[]> {
  const calendars: SyncableCalendar[] = [];
  let pageToken: string | undefined;

  do {
    const response = await calendar.calendarList.list({
      maxResults: 250,
      pageToken,
      showHidden: false,
    });

    for (const entry of response.data.items ?? []) {
      if (!isReadableCalendar(entry) || !entry.id) {
        continue;
      }

      if (!shouldSyncCalendarId(entry.id, accountEmail, entry.summary ?? null)) {
        continue;
      }

      calendars.push({
        id: entry.id,
        summary: entry.summary ?? null,
        accessRole: entry.accessRole ?? null,
      });
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  if (!calendars.some((item) => item.id === "primary")) {
    calendars.unshift({
      id: "primary",
      summary: accountEmail,
      accessRole: "owner",
    });
  }

  return calendars.sort((a, b) => calendarSyncPriority(a.id) - calendarSyncPriority(b.id));
}

function calendarSyncPriority(calendarId: string): number {
  if (calendarId === "primary") {
    return 0;
  }

  if (calendarId.endsWith("@resource.calendar.google.com")) {
    return 1;
  }

  return 2;
}

function calendarKind(
  calendarId: string,
  accountEmail: string,
  summary: string | null = null,
): SubscribedCalendarOption["kind"] {
  const id = calendarId.toLowerCase();
  if (id === "primary" || id === accountEmail.toLowerCase()) {
    return "primary";
  }
  if (id.endsWith("@resource.calendar.google.com")) {
    return "room";
  }
  if (id.includes("@group.v.calendar.google.com")) {
    return "holiday";
  }
  if (shouldSyncCalendarId(calendarId, accountEmail, summary)) {
    return "colleague";
  }
  return "other";
}

/** All calendars visible in Google CalendarList — for admin picker. */
export async function listSubscribedCalendarsForPicker(
  calendar: calendar_v3.Calendar,
  accountEmail: string,
): Promise<SubscribedCalendarOption[]> {
  const calendars: SubscribedCalendarOption[] = [];
  let pageToken: string | undefined;

  do {
    const response = await calendar.calendarList.list({
      maxResults: 250,
      pageToken,
      showHidden: false,
    });

    for (const entry of response.data.items ?? []) {
      if (!entry.id || entry.hidden) {
        continue;
      }

      const excluded = shouldExcludeCalendar(entry.id, entry.summary ?? null);
      const readable = entry.accessRole !== "freeBusyReader";
      calendars.push({
        id: entry.id,
        summary: entry.summary ?? entry.id,
        accessRole: entry.accessRole ?? null,
        kind: excluded
          ? "ignored"
          : calendarKind(entry.id, accountEmail, entry.summary ?? null),
        recommended:
          readable &&
          !excluded &&
          isRecommendedForBackfill(entry.id, accountEmail, entry.summary ?? null),
        readable,
      });
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  if (!calendars.some((item) => item.id === "primary")) {
    calendars.unshift({
      id: "primary",
      summary: accountEmail,
      accessRole: "owner",
      kind: "primary",
      recommended: true,
      readable: true,
    });
  }

  return calendars.sort(
    (a, b) =>
      Number(b.recommended) - Number(a.recommended) ||
      calendarSyncPriority(a.id) - calendarSyncPriority(b.id) ||
      (a.summary ?? a.id).localeCompare(b.summary ?? b.id),
  );
}

export function filterCalendarsBySelection(
  calendars: SyncableCalendar[],
  selectedIds: string[] | undefined,
): SyncableCalendar[] {
  if (!selectedIds?.length) {
    return calendars;
  }

  const allowed = new Set(selectedIds);
  return calendars.filter((calendar) => allowed.has(calendar.id));
}

/** True when attendee is a room/desk resource, not a person. */
export function isResourceParticipantEmail(email: string): boolean {
  return isNonPersonParticipant(email);
}

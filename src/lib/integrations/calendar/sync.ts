import "server-only";

import { GaxiosError } from "gaxios";
import type { calendar_v3 } from "googleapis";

import { autoResolveEligibleCalendarReviews } from "@/lib/integrations/calendar/auto-resolve-reviews";
import {
  listSyncableCalendars,
} from "@/lib/integrations/calendar/calendar-list";
import { getCalendarClient } from "@/lib/integrations/calendar/client";
import { removeCalendarEventDerivedData } from "@/lib/integrations/calendar/cleanup-event";
import { formatGoogleCalendarError } from "@/lib/integrations/calendar/google-errors";
import {
  calendarBackfillTimeMin,
  calendarLookaheadCutoff,
  CALENDAR_SYNC_MAX_PAGES_PER_CHUNK,
  isBeyondCalendarLookahead,
} from "@/lib/integrations/calendar/env";
import {
  hasExternalParticipant,
  loadOrgProfilesByEmail,
  processCalendarParticipants,
  type OrgProfileByEmail,
} from "@/lib/integrations/calendar/match";
import { calendarOccurrenceKey } from "@/lib/integrations/calendar/occurrence";
import { loadOrgParticipantFilters } from "@/lib/integrations/participant-email";
import {
  loadIgnoredParticipantEmails,
  loadOrgRelationshipsByProfileId,
  loadOwnedProfileEmails,
} from "@/lib/integrations/calendar/review-utils";
import { purgeBeyondLookaheadCalendarData } from "@/lib/integrations/calendar/purge-beyond-lookahead";
import { purgeInternalCalendarSyncData } from "@/lib/integrations/calendar/purge-internal";
import {
  initCalendarSyncProgress,
  mergeIntoTotals,
  parseCalendarSyncProgress,
  syncProgressHasMore,
  syncProgressSummary,
  type CalendarQueueItem,
  type CalendarSyncProgress,
} from "@/lib/integrations/calendar/sync-progress";
import {
  loadCalendarSyncCursors,
  parseCalendarAccountMetadata,
  resolvePrimarySyncCursor,
  type CalendarAccountMetadata,
  type CalendarSyncCursors,
} from "@/lib/integrations/calendar/sync-cursors";
import type {
  CalendarParticipant,
  CalendarSyncRunResult,
  CalendarSyncStats,
  ParsedCalendarEvent,
} from "@/lib/integrations/calendar/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

type CalendarAccount = {
  id: string;
  org_id: string;
  email: string;
  refresh_token: string;
  sync_cursor: string | null;
  metadata: Json | null;
  last_sync_at?: string | null;
};

function emptyStats(): CalendarSyncStats {
  return {
    eventsProcessed: 0,
    eventsSkippedDuplicate: 0,
    calendarsSynced: 0,
    activitiesCreated: 0,
    reviewsQueued: 0,
    profilesAutoCreated: 0,
    errors: [],
  };
}

function mergeStats(into: CalendarSyncStats, from: CalendarSyncStats): void {
  into.eventsProcessed += from.eventsProcessed;
  into.eventsSkippedDuplicate += from.eventsSkippedDuplicate;
  into.calendarsSynced += from.calendarsSynced;
  into.activitiesCreated += from.activitiesCreated;
  into.reviewsQueued += from.reviewsQueued;
  into.profilesAutoCreated += from.profilesAutoCreated;
  into.errors.push(...from.errors);
  if (from.rateLimited) {
    into.rateLimited = true;
  }
}

function parseEventDate(
  value: calendar_v3.Schema$EventDateTime | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  if (value.dateTime) {
    return new Date(value.dateTime).toISOString();
  }

  if (value.date) {
    return new Date(`${value.date}T00:00:00.000Z`).toISOString();
  }

  return null;
}

function parseParticipants(event: calendar_v3.Schema$Event): CalendarParticipant[] {
  const participants = new Map<string, CalendarParticipant>();
  const organizerEmail = event.organizer?.email?.trim().toLowerCase();

  if (organizerEmail) {
    participants.set(organizerEmail, {
      email: organizerEmail,
      name: event.organizer?.displayName ?? null,
      responseStatus: event.organizer?.self ? "accepted" : "needsAction",
      organizer: true,
    });
  }

  for (const attendee of event.attendees ?? []) {
    const email = attendee.email?.trim().toLowerCase();
    if (!email) {
      continue;
    }

    participants.set(email, {
      email,
      name: attendee.displayName ?? null,
      responseStatus: attendee.responseStatus ?? null,
      organizer: email === organizerEmail,
    });
  }

  return [...participants.values()];
}

function parseGoogleEvent(
  event: calendar_v3.Schema$Event,
  sourceCalendarId: string,
): ParsedCalendarEvent | null {
  const googleEventId = event.id;
  if (!googleEventId) {
    return null;
  }

  return {
    googleEventId,
    icalUid: event.iCalUID?.trim() ?? null,
    sourceCalendarId,
    title: event.summary ?? null,
    description: event.description ?? null,
    participants: parseParticipants(event),
    startAt: parseEventDate(event.start),
    endAt: parseEventDate(event.end),
    isDeleted: event.status === "cancelled",
  };
}

function backfillTimeMax(): string {
  return calendarLookaheadCutoff().toISOString();
}

async function findExistingOccurrenceEvent(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  icalUid: string,
  startAt: string,
): Promise<{ id: string; google_event_id: string } | null> {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, google_event_id")
    .eq("org_id", orgId)
    .eq("ical_uid", icalUid)
    .eq("start_at", startAt)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to lookup calendar occurrence: ${error.message}`);
  }

  return data;
}

async function upsertCalendarEvent(
  supabase: ReturnType<typeof createAdminClient>,
  account: CalendarAccount,
  parsed: ParsedCalendarEvent,
  participantFilters: Awaited<ReturnType<typeof loadOrgParticipantFilters>>,
  ignoredParticipantEmails: ReadonlySet<string>,
  profilesByEmail: OrgProfileByEmail,
  ownedProfileEmails: ReadonlySet<string>,
  relationshipsByProfileId: Awaited<
    ReturnType<typeof loadOrgRelationshipsByProfileId>
  >,
): Promise<{
  activitiesCreated: number;
  reviewsQueued: number;
  profilesAutoCreated: number;
  skippedDuplicate: boolean;
}> {
  const occurrenceKey = calendarOccurrenceKey(parsed.icalUid, parsed.startAt);

  if (occurrenceKey && parsed.icalUid && parsed.startAt) {
    const existing = await findExistingOccurrenceEvent(
      supabase,
      account.org_id,
      parsed.icalUid,
      parsed.startAt,
    );

    if (existing) {
      if (parsed.isDeleted) {
        const { error: tombstoneError } = await supabase
          .from("calendar_events")
          .update({ is_deleted: true })
          .eq("id", existing.id)
          .eq("org_id", account.org_id);

        if (tombstoneError) {
          throw new Error(
            `Failed to tombstone duplicate occurrence: ${tombstoneError.message}`,
          );
        }

        await removeCalendarEventDerivedData(
          supabase,
          account.org_id,
          existing.id,
          existing.google_event_id,
          parsed.icalUid,
          parsed.startAt,
        );
      }

      return {
        activitiesCreated: 0,
        reviewsQueued: 0,
        profilesAutoCreated: 0,
        skippedDuplicate: true,
      };
    }
  }

  if (
    !parsed.isDeleted &&
    !hasExternalParticipant(parsed.participants, participantFilters)
  ) {
    return {
      activitiesCreated: 0,
      reviewsQueued: 0,
      profilesAutoCreated: 0,
      skippedDuplicate: false,
    };
  }

  if (!parsed.isDeleted && isBeyondCalendarLookahead(parsed.startAt)) {
    return {
      activitiesCreated: 0,
      reviewsQueued: 0,
      profilesAutoCreated: 0,
      skippedDuplicate: false,
    };
  }

  const { data: eventRow, error: eventError } = await supabase
    .from("calendar_events")
    .upsert(
      {
        org_id: account.org_id,
        google_event_id: parsed.googleEventId,
        calendar_account_id: account.id,
        ical_uid: parsed.icalUid,
        source_calendar_id: parsed.sourceCalendarId,
        title: parsed.title,
        description: parsed.description,
        participants: parsed.participants as unknown as Json,
        start_at: parsed.startAt,
        end_at: parsed.endAt,
        is_deleted: parsed.isDeleted,
      },
      { onConflict: "org_id,google_event_id" },
    )
    .select("id")
    .single();

  if (eventError) {
    throw new Error(`Failed to upsert calendar event: ${eventError.message}`);
  }

  if (parsed.isDeleted) {
    await removeCalendarEventDerivedData(
      supabase,
      account.org_id,
      eventRow.id,
      parsed.googleEventId,
      parsed.icalUid,
      parsed.startAt,
    );
    return {
      activitiesCreated: 0,
      reviewsQueued: 0,
      profilesAutoCreated: 0,
      skippedDuplicate: false,
    };
  }

  const result = await processCalendarParticipants(supabase, {
    orgId: account.org_id,
    eventId: eventRow.id,
    googleEventId: parsed.googleEventId,
    icalUid: parsed.icalUid,
    startAt: parsed.startAt,
    title: parsed.title,
    participants: parsed.participants,
    participantFilters,
    ignoredParticipantEmails,
    profilesByEmail,
    ownedProfileEmails,
    relationshipsByProfileId,
  });

  return { ...result, skippedDuplicate: false };
}

async function syncCalendarFeed(
  calendar: calendar_v3.Calendar,
  params: {
    calendarId: string;
    syncToken: string | undefined;
    account: CalendarAccount;
    supabase: ReturnType<typeof createAdminClient>;
    participantFilters: Awaited<ReturnType<typeof loadOrgParticipantFilters>>;
    ignoredParticipantEmails: ReadonlySet<string>;
    profilesByEmail: OrgProfileByEmail;
    ownedProfileEmails: ReadonlySet<string>;
    relationshipsByProfileId: Awaited<
      ReturnType<typeof loadOrgRelationshipsByProfileId>
    >;
    maxPages?: number;
    resumePageToken?: string | null;
  },
): Promise<{
  stats: CalendarSyncStats;
  nextSyncToken: string | undefined;
  incompletePageToken: string | undefined;
  calendarFinished: boolean;
}> {
  const stats = emptyStats();
  let pageToken: string | undefined = params.resumePageToken ?? undefined;
  let nextSyncToken: string | undefined;
  let pagesProcessed = 0;
  const maxPages = params.maxPages ?? Number.POSITIVE_INFINITY;

  do {
    const response = await calendar.events.list({
      calendarId: params.calendarId,
      singleEvents: true,
      showDeleted: true,
      maxResults: 250,
      pageToken,
      syncToken: params.syncToken,
      timeMin: params.syncToken ? undefined : calendarBackfillTimeMin(),
      timeMax: params.syncToken ? undefined : backfillTimeMax(),
    });

    for (const item of response.data.items ?? []) {
      try {
        const parsed = parseGoogleEvent(item, params.calendarId);
        if (!parsed) {
          continue;
        }

        const result = await upsertCalendarEvent(
          params.supabase,
          params.account,
          parsed,
          params.participantFilters,
          params.ignoredParticipantEmails,
          params.profilesByEmail,
          params.ownedProfileEmails,
          params.relationshipsByProfileId,
        );

        if (result.skippedDuplicate) {
          stats.eventsSkippedDuplicate += 1;
        } else {
          stats.eventsProcessed += 1;
        }

        stats.activitiesCreated += result.activitiesCreated;
        stats.reviewsQueued += result.reviewsQueued;
        stats.profilesAutoCreated += result.profilesAutoCreated;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown event sync error";
        stats.errors.push(`${params.calendarId}: ${message}`);
      }
    }

    pageToken = response.data.nextPageToken ?? undefined;
    nextSyncToken = response.data.nextSyncToken ?? nextSyncToken;
    pagesProcessed += 1;

    if (pagesProcessed >= maxPages && pageToken) {
      return {
        stats,
        nextSyncToken,
        incompletePageToken: pageToken,
        calendarFinished: false,
      };
    }
  } while (pageToken);

  stats.calendarsSynced = 1;
  return {
    stats,
    nextSyncToken,
    incompletePageToken: undefined,
    calendarFinished: true,
  };
}

async function persistAccountSyncState(
  supabase: ReturnType<typeof createAdminClient>,
  account: CalendarAccount,
  params: {
    syncCursors: CalendarSyncCursors;
    stats: CalendarSyncStats;
    existingMetadata: CalendarAccountMetadata;
    progress: CalendarSyncProgress | null;
    syncing: boolean;
  },
): Promise<void> {
  const needsBackfill =
    params.progress !== null
      ? syncProgressHasMore(params.progress)
      : params.existingMetadata.selected_calendar_ids?.length
        ? params.existingMetadata.selected_calendar_ids.some(
            (calendarId) => !params.syncCursors[calendarId],
          )
        : false;

  const metadata: CalendarAccountMetadata = {
    ...params.existingMetadata,
    syncing: params.syncing,
    selected_calendar_ids: params.existingMetadata.selected_calendar_ids,
    needs_backfill: needsBackfill,
    sync_cursors: params.syncCursors,
    sync_progress: params.progress ?? undefined,
    last_run: {
      at: new Date().toISOString(),
      stats: params.progress?.totals ?? params.stats,
      calendars_synced: params.progress?.completed.length ?? params.stats.calendarsSynced,
      ...(params.stats.errors.length > 0
        ? { error: params.stats.errors[params.stats.errors.length - 1] }
        : {}),
    },
  };

  const { error } = await supabase
    .from("calendar_accounts")
    .update({
      last_sync_at: params.syncing ? account.last_sync_at ?? null : new Date().toISOString(),
      sync_cursor: resolvePrimarySyncCursor(params.syncCursors, account.email),
      metadata: metadata as unknown as Json,
    })
    .eq("id", account.id)
    .eq("org_id", account.org_id);

  if (error) {
    throw new Error(`Failed to persist calendar sync state: ${error.message}`);
  }
}

async function loadSyncContext(
  supabase: ReturnType<typeof createAdminClient>,
  account: CalendarAccount,
) {
  const participantFilters = await loadOrgParticipantFilters(
    supabase,
    account.org_id,
  );
  const ignoredParticipantEmails = await loadIgnoredParticipantEmails(
    supabase,
    account.org_id,
  );
  const profilesByEmail = await loadOrgProfilesByEmail(supabase, account.org_id);
  const ownedProfileEmails = await loadOwnedProfileEmails(supabase, account.org_id);
  const relationshipsByProfileId = await loadOrgRelationshipsByProfileId(
    supabase,
    account.org_id,
  );

  return {
    participantFilters,
    ignoredParticipantEmails,
    profilesByEmail,
    ownedProfileEmails,
    relationshipsByProfileId,
  };
}

async function finalizeCalendarSync(
  supabase: ReturnType<typeof createAdminClient>,
  account: CalendarAccount,
  stats: CalendarSyncStats,
  context: Awaited<ReturnType<typeof loadSyncContext>>,
): Promise<void> {
  try {
    const autoResolveResult = await autoResolveEligibleCalendarReviews(supabase, {
      orgId: account.org_id,
      participantFilters: context.participantFilters,
      profilesByEmail: context.profilesByEmail,
    });
    stats.profilesAutoCreated += autoResolveResult.profilesCreated;
    stats.activitiesCreated += autoResolveResult.activitiesCreated;
  } catch (autoResolveError) {
    const message =
      autoResolveError instanceof Error
        ? autoResolveError.message
        : "Calendar review auto-resolve failed";
    stats.errors.push(message);
  }
}

export async function runCalendarSyncChunk(
  account: CalendarAccount,
  options: {
    reset?: boolean;
    selectedCalendarIds?: string[];
    queueItems?: CalendarQueueItem[];
  } = {},
): Promise<CalendarSyncRunResult> {
  const supabase = createAdminClient();
  const calendar = getCalendarClient(account);
  const existingMetadata = parseCalendarAccountMetadata(account.metadata);
  const selectedCalendarIds =
    options.selectedCalendarIds ?? existingMetadata.selected_calendar_ids ?? [];
  const syncCursors = loadCalendarSyncCursors(account.metadata, account.sync_cursor);
  let progress = parseCalendarSyncProgress(account.metadata);

  if (options.reset && selectedCalendarIds.length > 0) {
    for (const calendarId of selectedCalendarIds) {
      delete syncCursors[calendarId];
    }
    progress = null;
  }

  const startingFresh =
    options.reset ||
    !progress ||
    progress.status === "complete" ||
    progress.status === "failed";

  let syncContext: Awaited<ReturnType<typeof loadSyncContext>> | undefined;

  if (startingFresh) {
    const queue =
      options.queueItems ??
      selectedCalendarIds.map((calendarId) => ({
        id: calendarId,
        summary: calendarId,
      }));

    if (queue.length === 0) {
      const stats = emptyStats();
      stats.errors.push("No calendars selected for sync");
      return { stats, hasMore: false, progress: null };
    }

    progress = initCalendarSyncProgress(queue);

    syncContext = await loadSyncContext(supabase, account);
    await purgeInternalCalendarSyncData(
      supabase,
      account.org_id,
      syncContext.participantFilters,
    );
    await purgeBeyondLookaheadCalendarData(supabase, account.org_id);
  }

  if (!progress) {
    const stats = emptyStats();
    return { stats, hasMore: false, progress: null };
  }

  if (progress.totals.rateLimited) {
    progress.totals.rateLimited = false;
    progress.last_error = null;
  }

  const context = syncContext ?? (await loadSyncContext(supabase, account));

  if (!progress.current) {
    if (progress.queue.length === 0) {
      progress.status = progress.totals.errors.length > 0 ? "failed" : "complete";
      progress.updated_at = new Date().toISOString();
      await finalizeCalendarSync(supabase, account, progress.totals, context);
      await persistAccountSyncState(supabase, account, {
        syncCursors,
        stats: progress.totals,
        existingMetadata: {
          ...existingMetadata,
          selected_calendar_ids: selectedCalendarIds,
          needs_backfill: false,
        },
        progress,
        syncing: false,
      });
      return { stats: progress.totals, hasMore: false, progress };
    }

    const next = progress.queue.shift()!;
    progress.current = { ...next, page_token: null };
  }

  const current = progress.current!;
  const calendarId = current.id;
  const syncToken = syncCursors[calendarId] || undefined;
  const resumePageToken = current.page_token ?? undefined;

  try {
    const feedResult = await syncCalendarFeed(calendar, {
      calendarId,
      syncToken,
      account,
      supabase,
      participantFilters: context.participantFilters,
      ignoredParticipantEmails: context.ignoredParticipantEmails,
      profilesByEmail: context.profilesByEmail,
      ownedProfileEmails: context.ownedProfileEmails,
      relationshipsByProfileId: context.relationshipsByProfileId,
      maxPages: CALENDAR_SYNC_MAX_PAGES_PER_CHUNK,
      resumePageToken,
    });

    mergeIntoTotals(progress.totals, feedResult.stats);

    if (feedResult.incompletePageToken) {
      progress.current = {
        ...current,
        page_token: feedResult.incompletePageToken,
      };
    } else {
      if (feedResult.nextSyncToken) {
        syncCursors[calendarId] = feedResult.nextSyncToken;
      }
      progress.completed.push({ id: calendarId, summary: current.summary });
      progress.current = null;
    }
  } catch (error) {
    if (error instanceof GaxiosError && error.response?.status === 429) {
      progress.totals.rateLimited = true;
      progress.totals.errors.push(
        `Rate limited on ${calendarId} — will retry on next chunk`,
      );
      progress.last_error = "Rate limited — retry shortly";
    } else {
      const message = formatGoogleCalendarError(error);
      const isExpiredToken =
        (error instanceof GaxiosError && error.response?.status === 410) ||
        message.includes("Sync token is no longer valid");

      if (isExpiredToken) {
        delete syncCursors[calendarId];
        try {
          const retryResult = await syncCalendarFeed(calendar, {
            calendarId,
            syncToken: undefined,
            account,
            supabase,
            participantFilters: context.participantFilters,
            ignoredParticipantEmails: context.ignoredParticipantEmails,
            profilesByEmail: context.profilesByEmail,
      ownedProfileEmails: context.ownedProfileEmails,
            relationshipsByProfileId: context.relationshipsByProfileId,
            maxPages: CALENDAR_SYNC_MAX_PAGES_PER_CHUNK,
            resumePageToken: undefined,
          });
          mergeIntoTotals(progress.totals, retryResult.stats);
          if (retryResult.incompletePageToken) {
            progress.current = {
              ...current,
              page_token: retryResult.incompletePageToken,
            };
          } else {
            if (retryResult.nextSyncToken) {
              syncCursors[calendarId] = retryResult.nextSyncToken;
            }
            progress.completed.push({ id: calendarId, summary: current.summary });
            progress.current = null;
          }
        } catch (retryError) {
          const retryMessage = formatGoogleCalendarError(retryError);
          progress.totals.errors.push(`${calendarId}: ${retryMessage}`);
          progress.last_error = retryMessage;
          progress.completed.push({ id: calendarId, summary: current.summary });
          progress.current = null;
        }
      } else {
        progress.totals.errors.push(`${calendarId}: ${message}`);
        progress.last_error = message;
        progress.completed.push({ id: calendarId, summary: current.summary });
        progress.current = null;
      }
    }
  }

  progress.updated_at = new Date().toISOString();
  progress.totals.errors = [...new Set(progress.totals.errors)].slice(-3);
  progress.last_error = progress.totals.errors.at(-1) ?? null;
  const hasMore = syncProgressHasMore(progress);

  if (!hasMore) {
    progress.status = progress.totals.errors.length > 0 ? "failed" : "complete";
    await finalizeCalendarSync(supabase, account, progress.totals, context);
  }

  await persistAccountSyncState(supabase, account, {
    syncCursors,
    stats: progress.totals,
    existingMetadata: {
      ...existingMetadata,
      selected_calendar_ids: selectedCalendarIds,
      needs_backfill: hasMore,
    },
    progress,
    syncing: hasMore,
  });

  return { stats: progress.totals, hasMore, progress };
}

const DEFAULT_SYNC_BURST_CHUNKS = 8;
const DEFAULT_SYNC_BURST_MS = 240_000;

export { DEFAULT_SYNC_BURST_CHUNKS };

export async function runCalendarSyncBurst(
  account: CalendarAccount,
  options: {
    maxChunks?: number;
    maxDurationMs?: number;
  } = {},
): Promise<CalendarSyncRunResult> {
  const supabase = createAdminClient();
  const maxChunks = options.maxChunks ?? DEFAULT_SYNC_BURST_CHUNKS;
  const deadline = Date.now() + (options.maxDurationMs ?? DEFAULT_SYNC_BURST_MS);
  let currentAccount = account;
  let lastResult: CalendarSyncRunResult = {
    stats: emptyStats(),
    hasMore: false,
    progress: null,
  };

  for (let index = 0; index < maxChunks; index += 1) {
    if (Date.now() >= deadline) {
      break;
    }

    lastResult = await runCalendarSyncChunk(currentAccount);
    if (!lastResult.hasMore || lastResult.progress?.totals.rateLimited) {
      break;
    }

    const { data, error } = await supabase
      .from("calendar_accounts")
      .select(
        "id, org_id, email, refresh_token, sync_cursor, metadata, last_sync_at",
      )
      .eq("id", account.id)
      .eq("org_id", account.org_id)
      .maybeSingle();

    if (error || !data) {
      break;
    }

    currentAccount = data;
  }

  return lastResult;
}

export async function syncCalendarAccountIncremental(
  account: CalendarAccount,
): Promise<CalendarSyncStats> {
  const stats = emptyStats();
  const supabase = createAdminClient();
  const calendar = getCalendarClient(account);
  const existingMetadata = parseCalendarAccountMetadata(account.metadata);
  const syncCursors = loadCalendarSyncCursors(account.metadata, account.sync_cursor);
  const context = await loadSyncContext(supabase, account);

  const syncableCalendars = existingMetadata.selected_calendar_ids?.length
    ? existingMetadata.selected_calendar_ids.map((calendarId) => ({
        id: calendarId,
        summary: calendarId,
        accessRole: null,
      }))
    : await listSyncableCalendars(calendar, account.email);

  try {
    for (const syncable of syncableCalendars) {
      const syncToken = syncCursors[syncable.id] || undefined;

      try {
        const feedResult = await syncCalendarFeed(calendar, {
          calendarId: syncable.id,
          syncToken,
          account,
          supabase,
          participantFilters: context.participantFilters,
          ignoredParticipantEmails: context.ignoredParticipantEmails,
          profilesByEmail: context.profilesByEmail,
          ownedProfileEmails: context.ownedProfileEmails,
          relationshipsByProfileId: context.relationshipsByProfileId,
          maxPages: CALENDAR_SYNC_MAX_PAGES_PER_CHUNK,
        });

        mergeStats(stats, feedResult.stats);

        if (feedResult.calendarFinished && feedResult.nextSyncToken) {
          syncCursors[syncable.id] = feedResult.nextSyncToken;
        } else if (!feedResult.calendarFinished) {
          stats.errors.push(
            `${syncable.id}: partial incremental sync — will continue on next run`,
          );
        }
      } catch (error) {
        if (error instanceof GaxiosError && error.response?.status === 429) {
          stats.errors.push(`Rate limited on ${syncable.id} — will retry on next run`);
          stats.rateLimited = true;
          break;
        }

        const message = formatGoogleCalendarError(error);
        const isExpiredToken =
          (error instanceof GaxiosError && error.response?.status === 410) ||
          message.includes("Sync token is no longer valid");

        if (isExpiredToken) {
          delete syncCursors[syncable.id];
          try {
            const retryResult = await syncCalendarFeed(calendar, {
              calendarId: syncable.id,
              syncToken: undefined,
              account,
              supabase,
              participantFilters: context.participantFilters,
              ignoredParticipantEmails: context.ignoredParticipantEmails,
              profilesByEmail: context.profilesByEmail,
              ownedProfileEmails: context.ownedProfileEmails,
              relationshipsByProfileId: context.relationshipsByProfileId,
              maxPages: CALENDAR_SYNC_MAX_PAGES_PER_CHUNK,
            });
            mergeStats(stats, retryResult.stats);
            if (retryResult.calendarFinished && retryResult.nextSyncToken) {
              syncCursors[syncable.id] = retryResult.nextSyncToken;
            }
          } catch (retryError) {
            stats.errors.push(
              `${syncable.id}: ${formatGoogleCalendarError(retryError)}`,
            );
          }
          continue;
        }

        stats.errors.push(`${syncable.id}: ${message}`);
      }
    }

    await finalizeCalendarSync(supabase, account, stats, context);
  } catch (error) {
    stats.errors.push(formatGoogleCalendarError(error));
  } finally {
    await persistAccountSyncState(supabase, account, {
      syncCursors,
      stats,
      existingMetadata,
      progress: null,
      syncing: false,
    });
  }

  return stats;
}

export async function syncCalendarAccount(
  account: CalendarAccount,
  options: {
    clearedCalendarId?: string;
    selectedCalendarIds?: string[];
    queueItems?: CalendarQueueItem[];
  } = {},
): Promise<CalendarSyncRunResult> {
  if (options.clearedCalendarId) {
    const supabase = createAdminClient();
    const syncCursors = loadCalendarSyncCursors(account.metadata, account.sync_cursor);
    delete syncCursors[options.clearedCalendarId];
    const existingMetadata = parseCalendarAccountMetadata(account.metadata);
    await persistAccountSyncState(supabase, account, {
      syncCursors,
      stats: emptyStats(),
      existingMetadata,
      progress: null,
      syncing: false,
    });
    return { stats: emptyStats(), hasMore: false, progress: null };
  }

  const existingMetadata = parseCalendarAccountMetadata(account.metadata);
  const selectedCalendarIds =
    options.selectedCalendarIds ?? existingMetadata.selected_calendar_ids;
  const progress = parseCalendarSyncProgress(account.metadata);
  const backfillActive =
    existingMetadata.needs_backfill ||
    options.selectedCalendarIds?.length ||
    (progress !== null && syncProgressHasMore(progress));

  if (backfillActive) {
    return runCalendarSyncChunk(account, {
      reset: Boolean(options.selectedCalendarIds?.length),
      selectedCalendarIds: options.selectedCalendarIds,
      queueItems: options.queueItems,
    });
  }

  const stats = await syncCalendarAccountIncremental(account);
  return { stats, hasMore: false, progress: null };
}

export async function syncAllCalendarAccounts(options?: {
  orgId?: string;
  maxAccounts?: number;
}): Promise<{
  accountsProcessed: number;
  stats: CalendarSyncStats;
  chunksRemaining: number;
}> {
  const supabase = createAdminClient();
  let query = supabase
    .from("calendar_accounts")
    .select("id, org_id, email, refresh_token, sync_cursor, metadata, last_sync_at")
    .eq("sync_enabled", true);

  if (options?.orgId) {
    query = query.eq("org_id", options.orgId);
  }

  const { data: accounts, error } = await query;

  if (error) {
    throw new Error(`Failed to load calendar accounts: ${error.message}`);
  }

  const accountList = accounts ?? [];
  const maxAccounts = options?.maxAccounts ?? accountList.length;
  const accountsToProcess = accountList.slice(0, Math.max(0, maxAccounts));

  const aggregate = emptyStats();
  let chunksRemaining = 0;

  for (const account of accountsToProcess) {
    const progress = parseCalendarSyncProgress(account.metadata);
    const metadata = parseCalendarAccountMetadata(account.metadata);
    const hasActiveChunk =
      (progress !== null && syncProgressHasMore(progress)) ||
      metadata.syncing === true ||
      metadata.needs_backfill === true;

    if (hasActiveChunk) {
      const burstDeadline = Date.now() + 270_000;
      let currentAccount = account;
      let result: CalendarSyncRunResult = {
        stats: emptyStats(),
        hasMore: false,
        progress: null,
      };

      do {
        result = await runCalendarSyncBurst(currentAccount, { maxChunks: 8 });
        mergeStats(aggregate, result.stats);

        if (!result.hasMore || result.stats.rateLimited) {
          break;
        }

        const { data, error } = await supabase
          .from("calendar_accounts")
          .select(
            "id, org_id, email, refresh_token, sync_cursor, metadata, last_sync_at",
          )
          .eq("id", account.id)
          .eq("org_id", account.org_id)
          .maybeSingle();

        if (error || !data) {
          break;
        }

        currentAccount = data;
      } while (Date.now() < burstDeadline);

      if (result.hasMore) {
        chunksRemaining += 1;
      }
      continue;
    }

    const stats = await syncCalendarAccountIncremental(account);
    mergeStats(aggregate, stats);
  }

  return {
    accountsProcessed: accountsToProcess.length,
    stats: aggregate,
    chunksRemaining,
  };
}

export { syncProgressSummary };

export async function upsertCalendarAccount(params: {
  orgId: string;
  userId: string;
  email: string;
  encryptedRefreshToken: string;
}) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("calendar_accounts")
    .upsert(
      {
        org_id: params.orgId,
        user_id: params.userId,
        email: params.email,
        refresh_token: params.encryptedRefreshToken,
        sync_enabled: true,
        sync_cursor: null,
        metadata: { needs_backfill: true, sync_cursors: {} },
      },
      { onConflict: "org_id,email" },
    )
    .select("id, org_id, email, refresh_token, sync_cursor, metadata")
    .single();

  if (error) {
    throw new Error(`Failed to store calendar account: ${error.message}`);
  }

  return data;
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { cleanupTextBatch } from "@/lib/ai/text-cleanup";
import { splitCompanyAndRoleBatch } from "@/lib/ai/split-company-role";
import { findOrCreateEventTag } from "@/lib/data/events";
import {
  disableEventbriteSyncAfterAuthFailure,
  getDecryptedEventbriteTokenForSync,
} from "@/lib/data/eventbrite-accounts";
import {
  loadQuestionFieldMapForSync,
  type MappableField,
} from "@/lib/data/eventbrite-question-mappings";
import { formatInteractionDate } from "@/lib/format/date";
import type {
  EventbriteAttendee,
  EventbriteAttendeeAnswer,
} from "@/lib/integrations/eventbrite/client";
import { EventbriteAuthError, listEventAttendees } from "@/lib/integrations/eventbrite/client";
import { normaliseOrganisationName } from "@/lib/normalise/organisation";
import { arePhoneNumbersEquivalent } from "@/lib/normalise/phone";
import { areRoleTextsEquivalent } from "@/lib/normalise/role-equivalence";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

type MappedField = "role" | "company_size" | "phone" | "organisation_name";
// "note" isn't a profile column — it never goes through FIELD_TO_COLUMN or
// the fill/queue-review comparison logic. It's additive: every mapped
// answer becomes its own new timeline entry on the profile, never something
// to compare against an existing value.
type MappedProfileFields = Partial<Record<MappedField, string>> & { note?: string };

const FIELD_TO_COLUMN: Record<
  MappedField,
  "occupation" | "company_size" | "phone" | "organisation_name"
> = {
  role: "occupation",
  company_size: "company_size",
  phone: "phone",
  organisation_name: "organisation_name",
};

type CleanupCacheField = "role" | "company_size" | "organisation_name";
type AiCacheField = "role" | "company_size" | "organisation_name" | "company_and_role";

type AiCacheEntry = { rawAnswer: string; result: unknown };

/**
 * Loads whatever's already cached for this batch of attendees, keyed by
 * `attendeeId:field`. Eventbrite resends every attendee's full current
 * answers on every sync, even from people nobody's touched since the last
 * run — without this, every one of those unchanged answers would get sent
 * to the AI (and paid for) again, every single time.
 */
async function loadAiAnswerCache(
  supabase: AdminClient,
  orgId: string,
  attendeeIds: string[],
): Promise<Map<string, AiCacheEntry>> {
  const cache = new Map<string, AiCacheEntry>();
  if (attendeeIds.length === 0) {
    return cache;
  }

  const { data, error } = await supabase
    .from("eventbrite_answer_ai_cache")
    .select("eventbrite_attendee_id, field, raw_answer, result")
    .eq("org_id", orgId)
    .in("eventbrite_attendee_id", attendeeIds);

  if (error) {
    // Missing cache just means everything gets (re)sent to the AI this
    // run — slower and pricier, not wrong — so this is worth logging but
    // not worth failing the whole sync over.
    console.error("Failed to load Eventbrite AI answer cache:", error.message);
    return cache;
  }

  for (const row of data ?? []) {
    cache.set(`${row.eventbrite_attendee_id}:${row.field}`, {
      rawAnswer: row.raw_answer,
      result: row.result,
    });
  }
  return cache;
}

async function saveAiAnswerCache(
  supabase: AdminClient,
  orgId: string,
  rows: Array<{ attendeeId: string; field: AiCacheField; rawAnswer: string; result: unknown }>,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase.from("eventbrite_answer_ai_cache").upsert(
    rows.map((row) => ({
      org_id: orgId,
      eventbrite_attendee_id: row.attendeeId,
      field: row.field,
      raw_answer: row.rawAnswer,
      result: row.result as never,
    })),
    { onConflict: "org_id,eventbrite_attendee_id,field" },
  );

  if (error) {
    // Same reasoning as the load side — a failed cache write means we'll
    // just re-ask the AI next time for this attendee, not a correctness
    // problem, so log and move on rather than failing the sync.
    console.error("Failed to save Eventbrite AI answer cache:", error.message);
  }
}

/**
 * Pulls out each attendee's answers to questions mapped to a profile field
 * (role/company size/phone/company-and-role-combined), then batch-processes
 * the free-text ones in one shot rather than one API call per attendee:
 * cleanupTextBatch for simple role/company-size answers, and
 * splitCompanyAndRoleBatch for the combined "what's your company & role"
 * style question, which needs splitting into two fields. Phone is left as
 * typed. An explicit "Role" question mapping (if the event has one) always
 * wins over whatever the combined split guesses.
 *
 * Checks the AI answer cache first (see loadAiAnswerCache) and only sends
 * genuinely new-or-changed raw answers to the AI — both a real speed/cost
 * win on repeat syncs, and a side benefit of keeping results stable rather
 * than an AI model occasionally re-phrasing an unchanged answer slightly
 * differently run to run.
 */
async function buildMappedFieldsByAttendee(
  supabase: AdminClient,
  orgId: string,
  attendees: EventbriteAttendee[],
  fieldMap: Map<string, MappableField>,
): Promise<Map<string, MappedProfileFields>> {
  const byAttendee = new Map<string, MappedProfileFields>();
  const combinedRawByAttendee = new Map<string, string>();

  if (fieldMap.size === 0) {
    return byAttendee;
  }

  for (const attendee of attendees) {
    const fields: MappedProfileFields = {};

    for (const answer of attendee.answers as EventbriteAttendeeAnswer[]) {
      if (!answer.questionId || !answer.answer) {
        continue;
      }
      const target = fieldMap.get(answer.questionId);
      if (!target || target === "ignore") {
        continue;
      }
      if (target === "company_and_role") {
        // Keep the first one seen if an event somehow has more than one.
        if (!combinedRawByAttendee.has(attendee.id)) {
          combinedRawByAttendee.set(attendee.id, answer.answer);
        }
        continue;
      }
      if (target === "company") {
        // "Company" is its own separate question but maps to the
        // organisation_name profile column, not a "company" column.
        fields.organisation_name = answer.answer;
        continue;
      }
      if (target === "note") {
        // Left exactly as typed — deliberately not run through the AI
        // text cleanup used for role/company/etc, since that's tuned for
        // tidying up short job-title-style answers and could easily mangle
        // the tone or meaning of a personal, open-ended answer.
        fields.note = answer.answer;
        continue;
      }
      fields[target] = answer.answer;
    }

    if (Object.keys(fields).length > 0 || combinedRawByAttendee.has(attendee.id)) {
      byAttendee.set(attendee.id, fields);
    }
  }

  if (byAttendee.size === 0) {
    return byAttendee;
  }

  const aiCache = await loadAiAnswerCache(supabase, orgId, Array.from(byAttendee.keys()));
  const cacheWrites: Array<{
    attendeeId: string;
    field: AiCacheField;
    rawAnswer: string;
    result: unknown;
  }> = [];

  // Only ever reuse a cached result that actually came from the AI. A
  // cached "fallback" result means the AI wasn't available (or failed) the
  // last time this exact answer was seen — reusing it would permanently
  // lock in the rough guess even after the AI starts working, which is
  // exactly the bug that made adding the Anthropic API key look like it
  // hadn't done anything: the first sync after it was added had already
  // cached fallback results, and every sync since just kept replaying them.
  function usableCache(key: string, rawAnswer: string): AiCacheEntry | null {
    const cached = aiCache.get(key);
    if (!cached || cached.rawAnswer !== rawAnswer) {
      return null;
    }
    const source = (cached.result as { source?: string } | null)?.source;
    return source === "ai" ? cached : null;
  }

  const textEntries: Array<{ attendeeId: string; field: CleanupCacheField }> = [];
  const textValues: string[] = [];

  for (const [attendeeId, fields] of byAttendee) {
    for (const field of ["role", "company_size", "organisation_name"] as const) {
      const value = fields[field];
      if (!value) {
        continue;
      }
      const cached = usableCache(`${attendeeId}:${field}`, value);
      if (cached) {
        const result = cached.result as { value?: string };
        if (result.value) {
          fields[field] = result.value;
          continue;
        }
      }
      textEntries.push({ attendeeId, field });
      textValues.push(value);
    }
  }

  if (textValues.length > 0) {
    const cleaned = await cleanupTextBatch(textValues);
    textEntries.forEach((entry, index) => {
      const fields = byAttendee.get(entry.attendeeId);
      const cleanedResult = cleaned[index];
      if (fields) {
        fields[entry.field] = cleanedResult.value;
      }
      if (cleanedResult.source === "ai") {
        cacheWrites.push({
          attendeeId: entry.attendeeId,
          field: entry.field,
          rawAnswer: textValues[index],
          result: { value: cleanedResult.value, source: "ai" },
        });
      }
    });
  }

  if (combinedRawByAttendee.size > 0) {
    const idsNeedingAi: string[] = [];
    const valuesNeedingAi: string[] = [];

    for (const [attendeeId, rawValue] of combinedRawByAttendee) {
      const cached = usableCache(`${attendeeId}:company_and_role`, rawValue);
      if (cached) {
        const result = cached.result as { role?: string | null; company?: string | null };
        const fields = byAttendee.get(attendeeId);
        if (fields) {
          if (result.role && !fields.role) {
            fields.role = result.role;
          }
          if (result.company && !fields.organisation_name) {
            fields.organisation_name = result.company;
          }
        }
        continue;
      }
      idsNeedingAi.push(attendeeId);
      valuesNeedingAi.push(rawValue);
    }

    if (valuesNeedingAi.length > 0) {
      const splits = await splitCompanyAndRoleBatch(valuesNeedingAi);
      idsNeedingAi.forEach((attendeeId, index) => {
        const fields = byAttendee.get(attendeeId);
        const { role, company, source } = splits[index];
        if (fields) {
          if (role && !fields.role) {
            fields.role = role;
          }
          if (company && !fields.organisation_name) {
            fields.organisation_name = company;
          }
        }
        if (source === "ai") {
          cacheWrites.push({
            attendeeId,
            field: "company_and_role",
            rawAnswer: valuesNeedingAi[index],
            result: { role, company, source: "ai" },
          });
        }
      });
    }
  }

  await saveAiAnswerCache(supabase, orgId, cacheWrites);

  return byAttendee;
}

type ProfileLookupRow = {
  id: string;
  email: string;
  occupation: string | null;
  company_size: string | null;
  phone: string | null;
  organisation_name: string | null;
};

type ExistingProfileUpdateReview = {
  id: string;
  status: string;
  proposedChanges: Record<string, { old: string; new: string }>;
};

/**
 * Loads every profile in the org that has an email, once per sync run,
 * keyed by lower-cased email. Replaces what used to be one "find profile by
 * email" database round trip per attendee — for an event with a few hundred
 * attendees that added up fast, especially once "Sync now" started walking
 * every linked event in one go. A whole org's worth of profiles (just a
 * handful of columns) is small enough to hold in memory for the length of
 * one sync.
 */
async function loadOrgProfileLookup(
  supabase: AdminClient,
  orgId: string,
): Promise<Map<string, ProfileLookupRow>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, occupation, company_size, phone, organisation_name")
    .eq("org_id", orgId)
    .not("email", "is", null);

  if (error) {
    throw new Error(`Failed to load profiles: ${error.message}`);
  }

  const byEmail = new Map<string, ProfileLookupRow>();
  for (const row of data ?? []) {
    if (row.email) {
      byEmail.set(row.email.trim().toLowerCase(), row as ProfileLookupRow);
    }
  }
  return byEmail;
}

/**
 * Decides whether a profile's current value for a field and a freshly
 * mapped Eventbrite answer are close enough to count as "the same," so a
 * reformatted answer doesn't queue a review that's really just noise —
 * "CMO" vs "Chief Marketing Officer," "+64 21 147 7242" vs "021 147 7242."
 * Deliberately conservative: falls back to a plain trimmed-string compare
 * for anything the field-specific check doesn't recognise as equivalent, so
 * a genuine change (a real promotion, a real new number) still gets flagged.
 */
function isSameFieldValue(
  column: "occupation" | "company_size" | "phone" | "organisation_name",
  current: string,
  newValue: string,
): boolean {
  if (current.trim() === newValue.trim()) {
    return true;
  }
  if (column === "phone") {
    return arePhoneNumbersEquivalent(current, newValue);
  }
  if (column === "occupation") {
    return areRoleTextsEquivalent(current, newValue);
  }
  if (column === "organisation_name") {
    const left = normaliseOrganisationName(current);
    const right = normaliseOrganisationName(newValue);
    return Boolean(left) && left === right;
  }
  return false;
}

/**
 * For an attendee who matched an existing profile: fills any of the
 * mapped fields that are currently blank on the profile directly, and
 * queues a human review (rather than overwriting) for any field that's
 * already set to something different — Jordan wants to be the pulse on
 * changed roles/companies, not silently lose the old value. Takes the
 * profile's current field values directly (already fetched in bulk by
 * loadOrgProfileLookup) rather than looking them up itself.
 */
async function applyMappedFieldsToMatchedProfile(
  supabase: AdminClient,
  orgId: string,
  event: MappedEvent,
  eventbriteAttendeeId: string,
  profile: ProfileLookupRow,
  mapped: MappedProfileFields,
  existingReview: ExistingProfileUpdateReview | undefined,
): Promise<void> {
  const profileId = profile.id;
  const fill: {
    occupation?: string;
    company_size?: string;
    phone?: string;
    organisation_name?: string;
    organisation_name_normalised?: string | null;
  } = {};
  const changes: Record<string, { old: string; new: string }> = {};
  const profileValues: Record<string, string | null> = {
    occupation: profile.occupation,
    company_size: profile.company_size,
    phone: profile.phone,
    organisation_name: profile.organisation_name,
  };

  for (const [field, newValue] of Object.entries(mapped) as Array<
    [MappedField, string]
  >) {
    const column = FIELD_TO_COLUMN[field];
    const current = profileValues[column];

    if (!current || !current.trim()) {
      fill[column] = newValue;
      if (column === "organisation_name") {
        fill.organisation_name_normalised = normaliseOrganisationName(newValue);
      }
    } else if (!isSameFieldValue(column, current, newValue)) {
      changes[field] = { old: current, new: newValue };
    }
  }

  if (Object.keys(fill).length > 0) {
    const { error: fillError } = await supabase
      .from("profiles")
      .update(fill)
      .eq("id", profileId)
      .eq("org_id", orgId);
    if (fillError) {
      throw new Error(`Failed to fill profile fields: ${fillError.message}`);
    }
  }

  if (Object.keys(changes).length > 0) {
    if (existingReview) {
      // Already queued (or resolved) from an earlier sync. If it's still
      // sitting there unresolved and this sync computed a different
      // suggestion — most notably, once the AI split/cleanup actually has
      // an API key to use, instead of the rough fallback — refresh it in
      // place so the reviewer sees the corrected values, rather than the
      // stale, wrongly-split ones sitting there forever. Never touch one
      // that's already been resolved (approved or dismissed) into a profile.
      if (
        existingReview.status === "pending" &&
        JSON.stringify(existingReview.proposedChanges) !== JSON.stringify(changes)
      ) {
        const { error: refreshError } = await supabase
          .from("eventbrite_profile_update_reviews")
          .update({ proposed_changes: changes })
          .eq("id", existingReview.id)
          .eq("org_id", orgId)
          .eq("status", "pending");
        if (refreshError) {
          throw new Error(
            `Failed to refresh profile update review: ${refreshError.message}`,
          );
        }
      }
      return;
    }

    const { error: reviewInsertError } = await supabase
      .from("eventbrite_profile_update_reviews")
      .insert({
        org_id: orgId,
        profile_id: profileId,
        event_id: event.id,
        eventbrite_attendee_id: eventbriteAttendeeId,
        proposed_changes: changes,
      });

    // 23505 = another row in this same batch already queued it (in-memory
    // de-duping above stops that for the same profile, but not across
    // different attendee IDs resolving to the same profile) — safe to
    // treat as done.
    if (reviewInsertError && reviewInsertError.code !== "23505") {
      throw new Error(
        `Failed to queue profile update review: ${reviewInsertError.message}`,
      );
    }
    return;
  }

  // No real differences this time — either nothing ever looked different,
  // or (now that formatting-only differences like "+64 21..." vs "021..."
  // or "CMO" vs "Chief Marketing Officer" no longer count as changes) what
  // used to look different doesn't anymore. If there's a suggestion still
  // sitting there unresolved from an earlier, noisier sync, clear it out
  // automatically rather than leaving a stale "update?" card for nothing.
  // Anything already actioned (applied or dismissed by a human) is left
  // alone either way.
  if (existingReview && existingReview.status === "pending") {
    const { error: clearError } = await supabase
      .from("eventbrite_profile_update_reviews")
      .update({ status: "ignored", reviewed_at: new Date().toISOString() })
      .eq("id", existingReview.id)
      .eq("org_id", orgId)
      .eq("status", "pending");
    if (clearError) {
      throw new Error(
        `Failed to clear outdated profile update review: ${clearError.message}`,
      );
    }
  }
}

export type EventbriteSyncStats = {
  eventsProcessed: number;
  attendeesFetched: number;
  attendeesSkippedNoEmail: number;
  attendeesMatched: number;
  attendeesQueuedForReview: number;
  attendeesAlreadyHandled: number;
  errors: string[];
};

type MappedEvent = {
  id: string;
  title: string;
  event_date: string;
  eventbrite_event_id: string;
};

/**
 * Syncs one event's attendees against the org's profiles.
 *
 * Rewritten to replace what used to be several sequential database round
 * trips per attendee (look up their profile, check if they're already
 * recorded as an attendee, check if attendance evidence already exists,
 * check if they're already tagged) with a handful of batched queries for
 * the whole event up front, then batched inserts for whatever's actually
 * new. That's what made "Sync now" take minutes once there were dozens of
 * linked events each with real attendee counts — this keeps the same
 * behaviour (never downgrades existing rows, never overwrites a resolved
 * review, still queues profile-update reviews rather than silently
 * overwriting changed answers) but does it in a small fixed number of
 * queries per event instead of one set per attendee.
 */
async function syncAttendeesForEvent(
  supabase: AdminClient,
  orgId: string,
  event: MappedEvent,
  token: string,
  systemUserId: string,
): Promise<{
  matched: number;
  queued: number;
  fetched: number;
  skippedNoEmail: number;
  alreadyHandled: number;
}> {
  const attendees = await listEventAttendees(token, event.eventbrite_event_id);
  const attendeesWithEmail = attendees.filter(
    (attendee): attendee is EventbriteAttendee & { email: string } => Boolean(attendee.email),
  );
  // Kept so "matched + queued" can be checked against what Eventbrite
  // actually reported for this event — attendees with no usable email
  // (people who withdrew their registration are already excluded by
  // listEventAttendees; this is specifically people with a blank or
  // "Info Requested" placeholder email) are the one category that's
  // silently skipped rather than matched, queued, or logged anywhere else.
  const fetched = attendees.length;
  const skippedNoEmail = attendees.length - attendeesWithEmail.length;

  if (attendeesWithEmail.length === 0) {
    return { matched: 0, queued: 0, fetched, skippedNoEmail, alreadyHandled: 0 };
  }

  const fieldMap = await loadQuestionFieldMapForSync(supabase, orgId, event.id);
  const mappedFieldsByAttendee = await buildMappedFieldsByAttendee(
    supabase,
    orgId,
    attendeesWithEmail,
    fieldMap,
  );

  // Attendance evidence ("Attended this event") and notes-from-this-event
  // both use source "event_system", but a profile can only have one
  // activities row per (org_id, profile_id, source, source_ref) — the
  // database enforces this with its own unique index, regardless of
  // activity_type. So notes get their own source_ref, distinct from the
  // plain event id used for attendance evidence, or the two would collide
  // on every re-sync of an event that already has attendance evidence.
  const noteSourceRef = `${event.id}:note`;

  const [
    profileByEmail,
    existingAttendeesResult,
    existingActivitiesResult,
    existingReviewsResult,
    existingProfileUpdateReviewsResult,
  ] = await Promise.all([
      loadOrgProfileLookup(supabase, orgId),
      supabase
        .from("event_attendees")
        .select("profile_id")
        .eq("org_id", orgId)
        .eq("event_id", event.id),
      supabase
        .from("activities")
        .select("profile_id, source_ref")
        .eq("org_id", orgId)
        .eq("source", "event_system")
        .in("source_ref", [event.id, noteSourceRef]),
      supabase
        .from("eventbrite_attendee_reviews")
        .select("eventbrite_attendee_id, status")
        .eq("org_id", orgId)
        .eq("event_id", event.id),
      supabase
        .from("eventbrite_profile_update_reviews")
        .select("id, eventbrite_attendee_id, status, proposed_changes")
        .eq("org_id", orgId)
        .eq("event_id", event.id),
    ]);

  if (existingAttendeesResult.error) {
    throw new Error(`Failed to load existing attendees: ${existingAttendeesResult.error.message}`);
  }
  if (existingActivitiesResult.error) {
    throw new Error(
      `Failed to load existing attendance evidence: ${existingActivitiesResult.error.message}`,
    );
  }
  if (existingReviewsResult.error) {
    throw new Error(`Failed to load existing reviews: ${existingReviewsResult.error.message}`);
  }
  if (existingProfileUpdateReviewsResult.error) {
    throw new Error(
      `Failed to load existing profile update reviews: ${existingProfileUpdateReviewsResult.error.message}`,
    );
  }

  const existingAttendeeProfileIds = new Set(
    (existingAttendeesResult.data ?? []).map((row) => row.profile_id),
  );
  const existingEvidenceProfileIds = new Set(
    (existingActivitiesResult.data ?? [])
      .filter((row) => row.source_ref === event.id)
      .map((row) => row.profile_id),
  );
  const existingNoteProfileIds = new Set(
    (existingActivitiesResult.data ?? [])
      .filter((row) => row.source_ref === noteSourceRef)
      .map((row) => row.profile_id),
  );
  const existingReviewStatusByAttendeeId = new Map(
    (existingReviewsResult.data ?? []).map((row) => [row.eventbrite_attendee_id, row.status]),
  );
  const existingProfileUpdateReviewByAttendeeId = new Map<string, ExistingProfileUpdateReview>(
    (existingProfileUpdateReviewsResult.data ?? []).map((row) => [
      row.eventbrite_attendee_id,
      {
        id: row.id,
        status: row.status,
        proposedChanges: (row.proposed_changes ?? {}) as Record<
          string,
          { old: string; new: string }
        >,
      },
    ]),
  );

  const tagResult = await findOrCreateEventTag(supabase, orgId, event.title);
  const tagId = tagResult.tagId;

  let existingTaggedProfileIds = new Set<string>();
  if (tagId) {
    const { data: taggedRows, error: taggedError } = await supabase
      .from("profile_tags")
      .select("profile_id")
      .eq("org_id", orgId)
      .eq("tag_id", tagId);
    if (taggedError) {
      throw new Error(`Failed to load existing tag links: ${taggedError.message}`);
    }
    existingTaggedProfileIds = new Set((taggedRows ?? []).map((row) => row.profile_id));
  }

  const newAttendeeRows: Array<{
    org_id: string;
    event_id: string;
    profile_id: string;
    attended: boolean;
  }> = [];
  const newActivityRows: Array<{
    org_id: string;
    profile_id: string;
    activity_type: "event";
    title: string;
    summary: string;
    activity_date: string;
    source: "event_system";
    source_ref: string;
    created_by: string;
  }> = [];
  const newTagRows: Array<{ org_id: string; profile_id: string; tag_id: string }> = [];
  const newNoteRows: Array<{
    org_id: string;
    profile_id: string;
    activity_type: "note";
    title: string;
    summary: string;
    activity_date: string;
    source: "event_system";
    source_ref: string;
    created_by: string;
  }> = [];
  const newReviewRows: Array<{
    org_id: string;
    event_id: string;
    eventbrite_attendee_id: string;
    email: string;
    display_name: string | null;
    ticket_type: string | null;
    mapped_fields: MappedProfileFields;
  }> = [];
  const reviewsNeedingRefresh: Array<{ eventbriteAttendeeId: string; mappedFields: MappedProfileFields }> = [];
  const mappedFieldUpdates: Array<{
    profile: ProfileLookupRow;
    eventbriteAttendeeId: string;
    mappedFields: MappedProfileFields;
  }> = [];

  let matched = 0;
  let queued = 0;
  let alreadyHandled = 0;

  for (const attendee of attendeesWithEmail) {
    const profile = profileByEmail.get(attendee.email.trim().toLowerCase());
    const mappedFields = mappedFieldsByAttendee.get(attendee.id);

    if (profile) {
      if (!existingAttendeeProfileIds.has(profile.id)) {
        newAttendeeRows.push({
          org_id: orgId,
          event_id: event.id,
          profile_id: profile.id,
          attended: false,
        });
        existingAttendeeProfileIds.add(profile.id);
      }
      if (!existingEvidenceProfileIds.has(profile.id)) {
        newActivityRows.push({
          org_id: orgId,
          profile_id: profile.id,
          activity_type: "event",
          title: event.title,
          summary: `Attended ${formatInteractionDate(event.event_date)}`,
          activity_date: event.event_date,
          source: "event_system",
          source_ref: event.id,
          created_by: systemUserId,
        });
        existingEvidenceProfileIds.add(profile.id);
      }
      if (tagId && !existingTaggedProfileIds.has(profile.id)) {
        newTagRows.push({ org_id: orgId, profile_id: profile.id, tag_id: tagId });
        existingTaggedProfileIds.add(profile.id);
      }
      if (mappedFields?.note && !existingNoteProfileIds.has(profile.id)) {
        newNoteRows.push({
          org_id: orgId,
          profile_id: profile.id,
          activity_type: "note",
          title: `Note from ${event.title}`,
          summary: mappedFields.note,
          activity_date: event.event_date,
          source: "event_system",
          source_ref: noteSourceRef,
          created_by: systemUserId,
        });
        existingNoteProfileIds.add(profile.id);
      }
      // "note" isn't a profile column, so it never goes through the
      // fill/queue-for-review comparison below — only pass the
      // column-backed fields (role/company size/phone/company) along.
      const columnFields: MappedProfileFields = { ...mappedFields };
      delete columnFields.note;
      if (Object.keys(columnFields).length > 0) {
        mappedFieldUpdates.push({
          profile,
          eventbriteAttendeeId: attendee.id,
          mappedFields: columnFields,
        });
      }
      matched += 1;
      continue;
    }

    const existingStatus = existingReviewStatusByAttendeeId.get(attendee.id);
    if (existingStatus === undefined) {
      newReviewRows.push({
        org_id: orgId,
        event_id: event.id,
        eventbrite_attendee_id: attendee.id,
        email: attendee.email,
        display_name: attendee.name,
        ticket_type: attendee.ticketType,
        mapped_fields: mappedFields ?? {},
      });
      queued += 1;
    } else {
      // Already queued from an earlier sync — whether it's still sitting
      // there unresolved, or you've since created/linked/ignored it,
      // there's nothing new to add or count here. Kept in its own bucket
      // (rather than just doing nothing) so "fetched" always reconciles
      // against matched + queued + skipped + alreadyHandled — a mismatch
      // there is a real signal something's actually being dropped, not
      // just normal steady-state re-syncing.
      alreadyHandled += 1;
      if (existingStatus === "pending" && mappedFields && Object.keys(mappedFields).length > 0) {
        // Still sitting there unresolved — refresh its mapped answers so a
        // question-mapping change made after the first sync shows up as a
        // suggestion. Never touch one that's already been resolved into a
        // profile.
        reviewsNeedingRefresh.push({ eventbriteAttendeeId: attendee.id, mappedFields });
      }
    }
  }

  if (newAttendeeRows.length > 0) {
    const { error } = await supabase
      .from("event_attendees")
      .upsert(newAttendeeRows, { onConflict: "event_id,profile_id", ignoreDuplicates: true });
    if (error) {
      throw new Error(`Failed to add attendees: ${error.message}`);
    }
  }

  if (newActivityRows.length > 0) {
    const { error } = await supabase.from("activities").insert(newActivityRows);
    if (error) {
      throw new Error(`Failed to record event attendance evidence: ${error.message}`);
    }
  }

  if (newNoteRows.length > 0) {
    // Plain insert, not upsert: the activities table's dedup index is
    // partial (only applies where source_ref isn't null), and Postgres
    // won't match a partial unique index against a plain ON CONFLICT
    // column list — upsert() has no way to express that here, and errors
    // with "no unique or exclusion constraint matching the ON CONFLICT
    // specification" every time. Catching 23505 instead does the same job:
    // in-memory de-duping above already stops two rows in this same batch
    // from colliding, so a 23505 here can only mean this profile already
    // has this event's note from somewhere else — safe to treat as done.
    const { error } = await supabase.from("activities").insert(newNoteRows);
    if (error && error.code !== "23505") {
      throw new Error(`Failed to add notes to profiles: ${error.message}`);
    }
  }

  if (newTagRows.length > 0) {
    const { error } = await supabase
      .from("profile_tags")
      .upsert(newTagRows, { onConflict: "profile_id,tag_id", ignoreDuplicates: true });
    if (error) {
      throw new Error(`Failed to tag attendees: ${error.message}`);
    }
  }

  if (newReviewRows.length > 0) {
    const { error } = await supabase
      .from("eventbrite_attendee_reviews")
      .upsert(newReviewRows, {
        onConflict: "org_id,event_id,eventbrite_attendee_id",
        ignoreDuplicates: true,
      });
    if (error) {
      throw new Error(`Failed to queue attendees for review: ${error.message}`);
    }
  }

  // Small, targeted set — only reviews that are still pending and got a
  // different mapped answer this time — so these stay individual updates
  // rather than needing their own batch machinery.
  for (const { eventbriteAttendeeId, mappedFields } of reviewsNeedingRefresh) {
    await supabase
      .from("eventbrite_attendee_reviews")
      .update({ mapped_fields: mappedFields })
      .eq("org_id", orgId)
      .eq("event_id", event.id)
      .eq("eventbrite_attendee_id", eventbriteAttendeeId)
      .eq("status", "pending");
  }

  // Also small and targeted — only matched attendees who actually answered
  // a mapped question — and each profile's fill/queue-for-review decision
  // depends on that profile's own current values, so these stay per-profile.
  for (const { profile, eventbriteAttendeeId, mappedFields } of mappedFieldUpdates) {
    await applyMappedFieldsToMatchedProfile(
      supabase,
      orgId,
      event,
      eventbriteAttendeeId,
      profile,
      mappedFields,
      existingProfileUpdateReviewByAttendeeId.get(eventbriteAttendeeId),
    );
  }

  return { matched, queued, fetched, skippedNoEmail, alreadyHandled };
}

const NEAR_TERM_WINDOW_DAYS = 14;
const RECENTLY_FINISHED_WINDOW_HOURS = 48;

function isNearTermEvent(eventDateIso: string): boolean {
  const eventTime = new Date(eventDateIso).getTime();
  const now = Date.now();
  const windowMs = NEAR_TERM_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recentMs = RECENTLY_FINISHED_WINDOW_HOURS * 60 * 60 * 1000;
  return eventTime >= now - recentMs && eventTime <= now + windowMs;
}

function emptyEventbriteStats(): EventbriteSyncStats {
  return {
    eventsProcessed: 0,
    attendeesFetched: 0,
    attendeesSkippedNoEmail: 0,
    attendeesMatched: 0,
    attendeesQueuedForReview: 0,
    attendeesAlreadyHandled: 0,
    errors: [],
  };
}

function mergeEventbriteStats(
  into: EventbriteSyncStats,
  from: { fetched: number; skippedNoEmail: number; matched: number; queued: number; alreadyHandled: number },
): void {
  into.eventsProcessed += 1;
  into.attendeesFetched += from.fetched;
  into.attendeesSkippedNoEmail += from.skippedNoEmail;
  into.attendeesMatched += from.matched;
  into.attendeesQueuedForReview += from.queued;
  into.attendeesAlreadyHandled += from.alreadyHandled;
}

async function loadFreshEventQueue(
  supabase: AdminClient,
  orgId: string,
  tier: "near_term" | "all",
): Promise<MappedEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id, title, event_date, eventbrite_event_id")
    .eq("org_id", orgId)
    .not("eventbrite_event_id", "is", null);

  if (error) {
    throw new Error(`Failed to load mapped events: ${error.message}`);
  }

  return (data ?? [])
    .filter((row): row is typeof row & { eventbrite_event_id: string } =>
      Boolean(row.eventbrite_event_id),
    )
    .filter((row) => tier === "all" || isNearTermEvent(row.event_date))
    .map((row) => ({
      id: row.id,
      title: row.title,
      event_date: row.event_date,
      eventbrite_event_id: row.eventbrite_event_id,
    }));
}

async function finishEventbriteSyncRun(
  supabase: AdminClient,
  orgId: string,
  stats: EventbriteSyncStats,
): Promise<void> {
  await supabase
    .from("eventbrite_accounts")
    .update({
      last_sync_at: new Date().toISOString(),
      sync_progress: null,
      metadata: { last_run: { at: new Date().toISOString(), stats } },
    })
    .eq("org_id", orgId);
}

type EventbriteSyncProgress = {
  tier: "near_term" | "all";
  remainingEvents: MappedEvent[];
  totalEvents: number;
  stats: EventbriteSyncStats;
  startedAt: string;
};

export type EventbriteSyncProgressSummary = {
  completed: number;
  total: number;
  currentEventTitle: string | null;
};

export type EventbriteSyncChunkResult = {
  stats: EventbriteSyncStats;
  hasMore: boolean;
  progress: EventbriteSyncProgressSummary | null;
};

/**
 * Does exactly one linked event's worth of work — fetch, match, queue,
 * apply/refresh review suggestions — then saves exactly where it left off,
 * on `eventbrite_accounts.sync_progress`. This is the smallest resumable
 * unit: "Sync now" and the automatic background syncs both work by calling
 * this (usually via runEventbriteSyncBurst below) repeatedly until nothing's
 * left, instead of the old approach of trying to process every linked event
 * inside a single request — which is exactly what let the whole thing get
 * silently killed by the server's time limit once there were enough events
 * linked. No single call here ever has to do more than one event's worth of
 * work, so it stops mattering how many events are linked in total.
 *
 * If a "Sync now" (tier "all") run and the automatic near-term run overlap,
 * whichever asks first keeps going under that tier; the other tier's queue
 * just gets freshly rebuilt next time something asks for it — nothing is
 * lost, at worst a few events get walked twice.
 */
export async function runEventbriteSyncChunk(
  orgId: string,
  tier: "near_term" | "all",
): Promise<EventbriteSyncChunkResult> {
  const supabase = createAdminClient();

  const { data: account, error: accountError } = await supabase
    .from("eventbrite_accounts")
    .select("connected_by, sync_progress")
    .eq("org_id", orgId)
    .eq("sync_enabled", true)
    .maybeSingle();

  if (accountError) {
    throw new Error(`Failed to load Eventbrite account: ${accountError.message}`);
  }
  if (!account?.connected_by) {
    return { stats: emptyEventbriteStats(), hasMore: false, progress: null };
  }

  const token = await getDecryptedEventbriteTokenForSync(orgId);
  if (!token) {
    return { stats: emptyEventbriteStats(), hasMore: false, progress: null };
  }

  let progress = account.sync_progress as EventbriteSyncProgress | null;

  if (!progress || progress.tier !== tier || progress.remainingEvents.length === 0) {
    const remainingEvents = await loadFreshEventQueue(supabase, orgId, tier);
    progress = {
      tier,
      remainingEvents,
      totalEvents: remainingEvents.length,
      stats: emptyEventbriteStats(),
      startedAt: new Date().toISOString(),
    };
  }

  const [event, ...rest] = progress.remainingEvents;

  if (!event) {
    // Nothing was queued at all (no linked-and-mapped events for this
    // tier) — finish immediately rather than leaving an empty run parked.
    await finishEventbriteSyncRun(supabase, orgId, progress.stats);
    return { stats: progress.stats, hasMore: false, progress: null };
  }

  try {
    const result = await syncAttendeesForEvent(supabase, orgId, event, token, account.connected_by);
    mergeEventbriteStats(progress.stats, result);
  } catch (syncError) {
    if (syncError instanceof EventbriteAuthError) {
      // The token itself has stopped working — every remaining event would
      // fail the exact same way, so stop here instead of hammering
      // Eventbrite through the rest of the queue, and switch sync off with
      // a clear reason rather than let it silently fail forever.
      progress.stats.errors.push(`Eventbrite connection stopped working: ${syncError.message}`);
      await disableEventbriteSyncAfterAuthFailure(orgId, syncError.message);
      await supabase.from("eventbrite_accounts").update({ sync_progress: null }).eq("org_id", orgId);
      return { stats: progress.stats, hasMore: false, progress: null };
    }
    // A one-off problem with just this event — log it and move on to the
    // rest of the queue, same as the old behaviour, rather than letting one
    // bad event block everything else linked.
    progress.stats.errors.push(
      `${event.title}: ${syncError instanceof Error ? syncError.message : "sync failed"}`,
    );
  }

  const hasMore = rest.length > 0;

  if (hasMore) {
    const { error: saveError } = await supabase
      .from("eventbrite_accounts")
      .update({ sync_progress: { ...progress, remainingEvents: rest } })
      .eq("org_id", orgId);
    if (saveError) {
      throw new Error(`Failed to save sync progress: ${saveError.message}`);
    }
  } else {
    await finishEventbriteSyncRun(supabase, orgId, progress.stats);
  }

  return {
    stats: progress.stats,
    hasMore,
    progress: {
      completed: progress.totalEvents - rest.length,
      total: progress.totalEvents,
      currentEventTitle: rest[0]?.title ?? null,
    },
  };
}

/**
 * Runs a bounded handful of chunks in a row — used by the interactive
 * "Sync now" button, which calls this once per click of its "keep going"
 * loop, and shows the returned progress before asking for the next burst.
 * Bounded so one HTTP round trip stays snappy; the caller decides when to
 * stop by checking `hasMore`.
 */
export async function runEventbriteSyncBurst(
  orgId: string,
  tier: "near_term" | "all",
  options: { maxChunks?: number; maxDurationMs?: number } = {},
): Promise<EventbriteSyncChunkResult> {
  const maxChunks = options.maxChunks ?? 5;
  const deadline = Date.now() + (options.maxDurationMs ?? 60_000);
  let last: EventbriteSyncChunkResult = {
    stats: emptyEventbriteStats(),
    hasMore: false,
    progress: null,
  };

  for (let index = 0; index < maxChunks; index += 1) {
    if (Date.now() >= deadline) {
      break;
    }
    last = await runEventbriteSyncChunk(orgId, tier);
    if (!last.hasMore) {
      break;
    }
  }

  return last;
}

/**
 * Syncs attendees for every Eventbrite-mapped event in one org, running to
 * completion (or until it genuinely runs out of time) in one call — for the
 * automatic background syncs, which have no browser tab polling for more.
 * Internally just loops bursts, the same building block the interactive
 * button uses, so it inherits the same resumability: if it ever does run
 * out of time before finishing, progress is saved mid-queue and the next
 * scheduled run (30 minutes or a day away) picks up right where this one
 * stopped, instead of silently failing partway with nothing to show for it.
 *
 * `tier: "near_term"` only processes events happening soon or that just
 * finished (the cron runs this every 30 minutes). `tier: "all"` processes
 * every mapped event regardless of date (used by the manual "Sync now"
 * button's underlying bursts, and by a slower daily catch-all pass).
 */
export async function syncEventbriteAttendeesForOrg(
  orgId: string,
  tier: "near_term" | "all" = "all",
): Promise<EventbriteSyncStats> {
  // Leaves a buffer under the 800s function limit (see the cron route and
  // admin layout) so this always gets a chance to save progress cleanly
  // rather than being killed mid-write.
  const deadline = Date.now() + 750_000;
  let last: EventbriteSyncChunkResult = {
    stats: emptyEventbriteStats(),
    hasMore: false,
    progress: null,
  };

  do {
    last = await runEventbriteSyncBurst(orgId, tier, { maxChunks: 8, maxDurationMs: 60_000 });
  } while (last.hasMore && Date.now() < deadline);

  return last.stats;
}

/**
 * Syncs attendees for just one newly-linked event, right after linking —
 * so attendees show up immediately instead of the admin having to wait for
 * the next cron tick (up to 30 minutes away) or remember to click "Sync
 * now". Scoped to one event, so it stays fast regardless of how many other
 * events are mapped.
 */
export async function syncEventbriteAttendeesForEvent(
  orgId: string,
  linkedEventId: string,
): Promise<{
  matched: number;
  queued: number;
  fetched: number;
  skippedNoEmail: number;
  alreadyHandled: number;
} | null> {
  const token = await getDecryptedEventbriteTokenForSync(orgId);
  if (!token) {
    return null;
  }

  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from("events")
    .select("id, title, event_date, eventbrite_event_id")
    .eq("id", linkedEventId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load event: ${error.message}`);
  }
  if (!row?.eventbrite_event_id) {
    return null;
  }

  const { data: connector } = await supabase
    .from("eventbrite_accounts")
    .select("connected_by")
    .eq("org_id", orgId)
    .maybeSingle();

  const systemUserId = connector?.connected_by;
  if (!systemUserId) {
    return null;
  }

  const event: MappedEvent = {
    id: row.id,
    title: row.title,
    event_date: row.event_date,
    eventbrite_event_id: row.eventbrite_event_id,
  };

  let result: {
    matched: number;
    queued: number;
    fetched: number;
    skippedNoEmail: number;
    alreadyHandled: number;
  };
  try {
    result = await syncAttendeesForEvent(supabase, orgId, event, token, systemUserId);
  } catch (syncError) {
    if (syncError instanceof EventbriteAuthError) {
      await disableEventbriteSyncAfterAuthFailure(orgId, syncError.message);
      return null;
    }
    throw syncError;
  }

  await supabase
    .from("eventbrite_accounts")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("org_id", orgId);

  return result;
}

/**
 * Purge mistaken calendar sync data without running a full Google sync.
 *
 * Removes:
 * - calendar_sync activities beyond the 3-month lookahead window
 * - far-future calendar_events and their meeting provenance
 * - calendar_sync activities and meeting provenance on internal team-domain profiles
 * - pending calendar_participant_reviews for internal addresses
 *
 * Usage:
 *   node --env-file=.env.local scripts/purge-calendar-sync.mjs
 *   npm run purge:calendar
 */
import { createClient } from "@supabase/supabase-js";

const LOCAL_DEV_ORG_ID = "11111111-1111-1111-1111-111111111111";
const CALENDAR_LOOKAHEAD_MONTHS = 3;

const IGNORED_EMAIL_PATTERNS = [
  /^noreply@/i,
  /^no-reply@/i,
  /^calendar-notification@/i,
  /^mailer-daemon@/i,
];

const NON_PERSON_EMAIL_PATTERNS = [
  ...IGNORED_EMAIL_PATTERNS,
  /@resource\.calendar\.google\.com$/i,
  /@group\.calendar\.google\.com$/i,
];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function normaliseEmail(email) {
  return email.trim().toLowerCase();
}

function extractEmailDomain(email) {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1);
}

function isNonPersonParticipant(email) {
  const normalised = normaliseEmail(email);
  if (!normalised) return true;
  return NON_PERSON_EMAIL_PATTERNS.some((pattern) => pattern.test(normalised));
}

function loadConfiguredInternalDomains() {
  const raw = process.env.ORG_INTERNAL_EMAIL_DOMAINS ?? "";
  return new Set(
    raw
      .split(",")
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean),
  );
}

function collectDomains(emails) {
  const domains = new Set();
  for (const email of emails) {
    const domain = extractEmailDomain(normaliseEmail(email));
    if (domain) domains.add(domain);
  }
  return domains;
}

function calendarLookaheadCutoff() {
  const date = new Date();
  date.setMonth(date.getMonth() + CALENDAR_LOOKAHEAD_MONTHS);
  return date.toISOString();
}

async function deleteInBatches(table, buildQuery, ids, batchSize = 100) {
  let removed = 0;

  for (let index = 0; index < ids.length; index += batchSize) {
    const batch = ids.slice(index, index + batchSize);
    const { data, error } = await buildQuery(batch);

    if (error) {
      throw error;
    }

    removed += data?.length ?? 0;
  }

  return removed;
}

async function resolveOrgId() {
  const slug = process.env.DEFAULT_ORG_SLUG?.trim();
  if (slug) {
    const { data, error } = await supabase
      .from("organisations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to resolve org by slug: ${error.message}`);
    }

    if (data?.id) {
      return data.id;
    }
  }

  console.warn(
    `DEFAULT_ORG_SLUG not set or not found — using local seed org ${LOCAL_DEV_ORG_ID}`,
  );
  return LOCAL_DEV_ORG_ID;
}

async function loadOrgParticipantFilters(orgId) {
  const [usersResult, gmailResult, calendarResult] = await Promise.all([
    supabase.from("users").select("email").eq("org_id", orgId),
    supabase.from("gmail_accounts").select("email").eq("org_id", orgId),
    supabase.from("calendar_accounts").select("email").eq("org_id", orgId),
  ]);

  if (usersResult.error) {
    throw new Error(`Failed to load org team emails: ${usersResult.error.message}`);
  }

  const teamEmails = new Set(
    (usersResult.data ?? [])
      .map((row) => row.email?.trim().toLowerCase())
      .filter(Boolean),
  );

  const internalDomains = collectDomains([
    ...teamEmails,
    ...(gmailResult.data ?? []).map((row) => row.email),
    ...(calendarResult.data ?? []).map((row) => row.email),
  ]);

  for (const domain of loadConfiguredInternalDomains()) {
    internalDomains.add(domain);
  }

  return { teamEmails, internalDomains };
}

function isInternalParticipant(email, filters) {
  const normalised = normaliseEmail(email);
  if (!normalised) return true;
  if (filters.teamEmails.has(normalised)) return true;

  const domain = extractEmailDomain(normalised);
  if (domain && filters.internalDomains.has(domain)) return true;

  return isNonPersonParticipant(normalised);
}

async function deleteActivitiesByIds(orgId, ids) {
  if (ids.length === 0) return 0;

  return deleteInBatches(
    "activities",
    (batch) =>
      supabase
        .from("activities")
        .delete()
        .eq("org_id", orgId)
        .in("id", batch)
        .select("id"),
    ids,
  );
}

async function purgeBeyondLookahead(orgId) {
  const cutoff = calendarLookaheadCutoff();

  let activitiesRemovedByDate = 0;

  while (true) {
    const { data: farActivities, error: selectError } = await supabase
      .from("activities")
      .select("id")
      .eq("org_id", orgId)
      .eq("source", "calendar_sync")
      .gt("activity_date", cutoff)
      .limit(1000);

    if (selectError) {
      throw new Error(
        `Failed to load far-future calendar activities: ${selectError.message}`,
      );
    }

    if (!farActivities?.length) {
      break;
    }

    activitiesRemovedByDate += await deleteActivitiesByIds(
      orgId,
      farActivities.map((row) => row.id),
    );
  }

  let activitiesFromEvents = 0;
  let sourcesRemoved = 0;
  let eventsRemoved = 0;

  while (true) {
    const { data: farEvents, error: eventsError } = await supabase
      .from("calendar_events")
      .select("id, google_event_id")
      .eq("org_id", orgId)
      .gt("start_at", cutoff)
      .limit(1000);

    if (eventsError) {
      throw new Error(
        `Failed to load far-future calendar events: ${eventsError.message}`,
      );
    }

    if (!farEvents?.length) {
      break;
    }

    const googleEventIds = farEvents.map((event) => event.google_event_id);
    const eventIds = farEvents.map((event) => event.id);

    activitiesFromEvents += await deleteInBatches(
      "activities",
      (batch) =>
        supabase
          .from("activities")
          .delete()
          .eq("org_id", orgId)
          .eq("source", "calendar_sync")
          .in("source_ref", batch)
          .select("id"),
      googleEventIds,
    );

    sourcesRemoved += await deleteInBatches(
      "relationship_sources",
      (batch) =>
        supabase
          .from("relationship_sources")
          .delete()
          .eq("org_id", orgId)
          .eq("source_type", "meeting")
          .in("source_id", batch)
          .select("id"),
      eventIds,
    );

    eventsRemoved += await deleteInBatches(
      "calendar_events",
      (batch) => supabase.from("calendar_events").delete().in("id", batch).select("id"),
      eventIds,
    );
  }

  return {
    eventsRemoved,
    activitiesRemoved: activitiesRemovedByDate + activitiesFromEvents,
    sourcesRemoved,
    cutoff,
  };
}

async function purgeInternal(orgId, filters) {
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("org_id", orgId);

  if (profilesError) {
    throw new Error(`Failed to load profiles for cleanup: ${profilesError.message}`);
  }

  const internalProfiles = (profiles ?? []).filter(
    (profile) => profile.email && isInternalParticipant(profile.email, filters),
  );
  const internalProfileIds = internalProfiles.map((profile) => profile.id);

  let activitiesRemoved = 0;
  let sourcesRemoved = 0;

  if (internalProfileIds.length > 0) {
    while (true) {
      const { data: internalActivities, error: selectError } = await supabase
        .from("activities")
        .select("id")
        .eq("org_id", orgId)
        .eq("source", "calendar_sync")
        .in("profile_id", internalProfileIds)
        .limit(1000);

      if (selectError) {
        throw new Error(
          `Failed to load internal calendar activities: ${selectError.message}`,
        );
      }

      if (!internalActivities?.length) {
        break;
      }

      activitiesRemoved += await deleteActivitiesByIds(
        orgId,
        internalActivities.map((row) => row.id),
      );
    }

    const { data: relationships, error: relationshipsError } = await supabase
      .from("relationships")
      .select("id")
      .eq("org_id", orgId)
      .in("profile_id", internalProfileIds);

    if (relationshipsError) {
      throw new Error(
        `Failed to load internal relationships for cleanup: ${relationshipsError.message}`,
      );
    }

    const relationshipIds = (relationships ?? []).map((row) => row.id);

    if (relationshipIds.length > 0) {
      sourcesRemoved = await deleteInBatches(
        "relationship_sources",
        (batch) =>
          supabase
            .from("relationship_sources")
            .delete()
            .eq("org_id", orgId)
            .eq("source_type", "meeting")
            .in("relationship_id", batch)
            .select("id"),
        relationshipIds,
      );
    }
  }

  const { data: pendingReviews, error: reviewsError } = await supabase
    .from("calendar_participant_reviews")
    .select("id, email")
    .eq("org_id", orgId)
    .eq("status", "pending");

  if (reviewsError) {
    throw new Error(
      `Failed to load pending calendar reviews for cleanup: ${reviewsError.message}`,
    );
  }

  const reviewIdsToRemove = (pendingReviews ?? [])
    .filter((review) => isInternalParticipant(review.email, filters))
    .map((review) => review.id);

  let reviewsRemoved = 0;

  if (reviewIdsToRemove.length > 0) {
    const { data: deletedReviews, error: deleteReviewsError } = await supabase
      .from("calendar_participant_reviews")
      .delete()
      .in("id", reviewIdsToRemove)
      .select("id");

    if (deleteReviewsError) {
      throw new Error(
        `Failed to remove internal calendar reviews: ${deleteReviewsError.message}`,
      );
    }

    reviewsRemoved = deletedReviews?.length ?? 0;
  }

  return {
    activitiesRemoved,
    sourcesRemoved,
    reviewsRemoved,
    internalProfiles: internalProfiles.map(
      (profile) => `${profile.full_name} <${profile.email}>`,
    ),
  };
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — use --env-file=.env.local",
    );
  }

  const orgId = await resolveOrgId();
  const filters = await loadOrgParticipantFilters(orgId);

  console.log(`Purging calendar sync data for org ${orgId}`);
  console.log(
    `Lookahead cutoff: ${calendarLookaheadCutoff()} (${CALENDAR_LOOKAHEAD_MONTHS} months ahead)`,
  );
  console.log(
    `Internal domains: ${[...filters.internalDomains].join(", ") || "(none)"}`,
  );

  const lookahead = await purgeBeyondLookahead(orgId);
  const internal = await purgeInternal(orgId, filters);

  console.log("\nFar-future cleanup:");
  console.log(`  activities removed: ${lookahead.activitiesRemoved}`);
  console.log(`  calendar events removed: ${lookahead.eventsRemoved}`);
  console.log(`  meeting provenance removed: ${lookahead.sourcesRemoved}`);

  console.log("\nInternal team cleanup:");
  console.log(`  activities removed: ${internal.activitiesRemoved}`);
  console.log(`  meeting provenance removed: ${internal.sourcesRemoved}`);
  console.log(`  pending reviews removed: ${internal.reviewsRemoved}`);
  if (internal.internalProfiles.length > 0) {
    console.log("  internal profiles:");
    for (const profile of internal.internalProfiles) {
      console.log(`    - ${profile}`);
    }
  }

  console.log("\nDone. Refresh the profile page to see updated timeline and provenance.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

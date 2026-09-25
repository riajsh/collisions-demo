import "server-only";

import { getOrgId } from "@/lib/auth/session";
import { listProfileIds } from "@/lib/data/profiles";
import {
  semanticProfileSearch,
  type SemanticProfileMatch,
} from "@/lib/data/semantic-profile-search";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type SearchFilters = {
  /** One or more tag ids to match (ANY, not ALL) — plural because a single
   * filter chip on the Search page can represent a whole event series
   * (several related tag rows grouped together), not just one tag. */
  tagIds?: string[];
  ownerUserId?: string;
  status?: Database["public"]["Enums"]["relationship_status"];
};

export type SearchEntityType =
  | "profile"
  | "activity"
  | "event"
  | "thread"
  | "message";

export type SearchResult = {
  id: string;
  entityType: SearchEntityType;
  title: string;
  subtitle: string | null;
  rank: number;
  href: string;
  profileId?: string;
  primaryOwnerName?: string | null;
  lastInteractionAt?: string | null;
  activityDate?: string;
  eventDate?: string;
  contextLabel: string;
  /** Set when this profile was found by the AI reasoning about the query
   * (role/seniority/industry matching, not literal keyword matching) —
   * shown in the UI so it's clear why someone with no obvious keyword
   * match showed up. */
  matchReason?: string;
};

type SearchIndexRow = {
  id: string | null;
  entity_type: string | null;
  title: string | null;
  subtitle: string | null;
};

// Effectively "show everything relevant" rather than an arbitrary small
// cutoff — Jordan wants to see the full relevant set to compare candidates,
// not just a top slice. 1000 matches Supabase/PostgREST's own default
// per-query row cap, so this is already the practical ceiling for a
// single query; if the org ever grows past that, these queries will need
// real pagination (same pattern as the backfill script's .range() paging)
// rather than just raising the number further.
const ENTITY_LIMIT = 1000;
const OVERALL_LIMIT = 1000;

const ENTITY_LABELS: Record<SearchEntityType, string> = {
  profile: "Profile",
  activity: "Activity",
  event: "Event",
  thread: "Email thread",
  message: "Email message",
};

function normalizeQuery(query: string): string | null {
  const trimmed = query.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function searchIndexRows(
  entityType: string,
  query: string,
  orgId: string,
): Promise<Array<SearchIndexRow & { id: string }>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("search_index")
    .select("id, entity_type, title, subtitle")
    .eq("org_id", orgId)
    .eq("entity_type", entityType)
    .textSearch("fts", query, { type: "plain", config: "english" })
    .limit(ENTITY_LIMIT);

  if (error) {
    throw new Error(`Search failed for ${entityType}: ${error.message}`);
  }

  return (data ?? []).filter((row): row is SearchIndexRow & { id: string } =>
    Boolean(row.id),
  );
}

async function profilesFromTags(
  tagIds: string[],
  orgId: string,
): Promise<Array<{ id: string; full_name: string; organisation_name: string | null; tag_name: string }>> {
  if (tagIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profile_tags")
    .select(
      `
      profile_id,
      tags ( name ),
      profiles!inner (
        id,
        full_name,
        organisation_name
      )
    `,
    )
    .eq("org_id", orgId)
    .in("tag_id", tagIds);

  if (error) {
    throw new Error(`Tag profile search failed: ${error.message}`);
  }

  return (data ?? []).flatMap((row) => {
    const profile = row.profiles as {
      id: string;
      full_name: string;
      organisation_name: string | null;
    } | null;
    const tag = row.tags as { name: string } | null;

    if (!profile) {
      return [];
    }

    return [
      {
        id: profile.id,
        full_name: profile.full_name,
        organisation_name: profile.organisation_name,
        tag_name: tag?.name ?? "Tag",
      },
    ];
  });
}

async function enrichProfiles(
  profileIds: string[],
): Promise<
  Map<
    string,
    { primaryOwnerName: string | null; lastInteractionAt: string | null }
  >
> {
  const map = new Map<
    string,
    { primaryOwnerName: string | null; lastInteractionAt: string | null }
  >();

  if (profileIds.length === 0) {
    return map;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      `
      id,
      relationships (
        relationship_owners (
          is_primary,
          last_interaction_at,
          users ( full_name )
        )
      )
    `,
    )
    .in("id", profileIds);

  if (error) {
    throw new Error(`Failed to enrich search profiles: ${error.message}`);
  }

  for (const profile of data ?? []) {
    const owners = profile.relationships?.[0]?.relationship_owners ?? [];
    const primary =
      owners.find((owner) => owner.is_primary) ?? owners[0] ?? null;
    const user = primary?.users as { full_name: string } | null;

    map.set(profile.id, {
      primaryOwnerName: user?.full_name ?? null,
      lastInteractionAt: primary?.last_interaction_at ?? null,
    });
  }

  return map;
}

async function enrichActivities(
  activityIds: string[],
): Promise<
  Map<string, { profileId: string; activityDate: string; summary: string | null }>
> {
  const map = new Map<
    string,
    { profileId: string; activityDate: string; summary: string | null }
  >();

  if (activityIds.length === 0) {
    return map;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .select("id, profile_id, activity_date, summary")
    .in("id", activityIds);

  if (error) {
    throw new Error(`Failed to enrich search activities: ${error.message}`);
  }

  for (const activity of data ?? []) {
    map.set(activity.id, {
      profileId: activity.profile_id,
      activityDate: activity.activity_date,
      summary: activity.summary,
    });
  }

  return map;
}

async function enrichEvents(
  eventIds: string[],
): Promise<Map<string, { eventDate: string }>> {
  const map = new Map<string, { eventDate: string }>();

  if (eventIds.length === 0) {
    return map;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, event_date")
    .in("id", eventIds);

  if (error) {
    throw new Error(`Failed to enrich search events: ${error.message}`);
  }

  for (const event of data ?? []) {
    map.set(event.id, { eventDate: event.event_date });
  }

  return map;
}

async function enrichThreads(
  threadIds: string[],
): Promise<Map<string, { subject: string | null }>> {
  const map = new Map<string, { subject: string | null }>();

  if (threadIds.length === 0) {
    return map;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_threads")
    .select("id, subject")
    .in("id", threadIds);

  if (error) {
    throw new Error(`Failed to enrich search threads: ${error.message}`);
  }

  for (const thread of data ?? []) {
    map.set(thread.id, { subject: thread.subject });
  }

  return map;
}

async function searchEmailBodies(
  query: string,
): Promise<
  Array<{
    id: string;
    thread_id: string;
    rank: number;
    sent_at: string | null;
    gmail_message_id: string;
  }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_email_message_bodies", {
    p_query: query,
    p_limit: ENTITY_LIMIT,
  });

  if (error) {
    throw new Error(`Email body search failed: ${error.message}`);
  }

  return data ?? [];
}

async function getAllowedProfileIds(
  filters?: SearchFilters,
): Promise<Set<string> | null> {
  const tagIds = filters?.tagIds?.filter(Boolean) ?? [];

  if (tagIds.length === 0 && !filters?.ownerUserId && !filters?.status) {
    return null;
  }

  const profileIds = await listProfileIds({
    tagId: tagIds.length === 1 ? tagIds[0] : undefined,
    tagIds: tagIds.length > 1 ? tagIds : undefined,
    ownerUserId: filters?.ownerUserId,
    status: filters?.status,
  });

  return new Set(profileIds);
}

/**
 * Events don't have a single owner the way profiles do — only attendees,
 * who can each be owned by different team members. As agreed, "filter
 * events by owner/status" means "the event has at least one attendee
 * matching that owner/status" — an approximation, not exact scoping, but a
 * reasonable one given events are many-to-many with people.
 */
async function eventIdsWithAllowedAttendee(
  eventIds: string[],
  allowedProfileIds: Set<string>,
  orgId: string,
): Promise<Set<string>> {
  if (eventIds.length === 0 || allowedProfileIds.size === 0) {
    return new Set();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_attendees")
    .select("event_id, profile_id")
    .eq("org_id", orgId)
    .in("event_id", eventIds)
    .in("profile_id", [...allowedProfileIds]);

  if (error) {
    throw new Error(`Failed to scope events by owner/status: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => row.event_id));
}

function applyProfileFilters(
  results: SearchResult[],
  allowedProfileIds: Set<string> | null,
  allowedEventIds: Set<string> | null,
): SearchResult[] {
  if (!allowedProfileIds) {
    return results;
  }

  return results.filter((result) => {
    if (result.entityType === "profile") {
      return allowedProfileIds.has(result.id);
    }

    if (result.entityType === "activity") {
      return Boolean(
        result.profileId && allowedProfileIds.has(result.profileId),
      );
    }

    if (result.entityType === "event") {
      return Boolean(allowedEventIds?.has(result.id));
    }

    // Email threads/messages aren't owner/status/tag-scoped yet — a thread
    // belongs to whichever mailbox synced it, not a CRM relationship, so
    // there's no clean equivalent field to filter on. Left unscoped
    // deliberately for now rather than approximated.
    return true;
  });
}

export async function search(
  query: string,
  filters?: SearchFilters,
): Promise<SearchResult[]> {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return [];
  }

  const orgId = await getOrgId();
  const allowedProfileIds = await getAllowedProfileIds(filters);

  // Kicked off alongside the literal keyword search, not after it — this is
  // the "reasons about roles/industries" half of intelligent search
  // (parses the query, matches by AI-inferred tags, then has Claude review
  // the shortlist). Wrapped so a hiccup here (bad response, DB error)
  // degrades to "no AI matches" instead of breaking search entirely.
  const semanticMatchesPromise: Promise<SemanticProfileMatch[] | null> =
    semanticProfileSearch(normalized, orgId).catch((error) => {
      console.error(
        "search: semantic profile search failed, continuing without it —",
        error instanceof Error ? error.message : error,
      );
      return null;
    });

  const [profiles, activities, events, threads, tagRows, emailBodies] =
    await Promise.all([
      searchIndexRows("profile", normalized, orgId),
      searchIndexRows("activity", normalized, orgId),
      searchIndexRows("event", normalized, orgId),
      searchIndexRows("thread", normalized, orgId),
      searchIndexRows("tag", normalized, orgId),
      searchEmailBodies(normalized),
    ]);

  const tagProfileRows = await profilesFromTags(
    tagRows.map((row) => row.id),
    orgId,
  );

  const profileIds = new Set<string>();
  const results: SearchResult[] = [];

  for (const row of profiles) {
    profileIds.add(row.id);
    results.push({
      id: row.id,
      entityType: "profile",
      title: row.title ?? "Unknown profile",
      subtitle: row.subtitle,
      rank: 1,
      href: `/profiles/${row.id}`,
      profileId: row.id,
      contextLabel: ENTITY_LABELS.profile,
    });
  }

  for (const row of tagProfileRows) {
    if (profileIds.has(row.id)) {
      continue;
    }
    profileIds.add(row.id);
    results.push({
      id: row.id,
      entityType: "profile",
      title: row.full_name,
      subtitle: row.organisation_name,
      rank: 0.9,
      href: `/profiles/${row.id}`,
      profileId: row.id,
      contextLabel: `Profile · Tag: ${row.tag_name}`,
    });
  }

  const semanticMatches = await semanticMatchesPromise;

  if (semanticMatches) {
    semanticMatches.forEach((match, index) => {
      const existing = results.find(
        (result) => result.entityType === "profile" && result.id === match.profileId,
      );

      if (existing) {
        existing.matchReason = match.reason || undefined;
        return;
      }

      profileIds.add(match.profileId);
      // Ranked just under literal profile matches but above tag-derived
      // ones, in the AI's own best-match-first order (index 0 = best).
      results.push({
        id: match.profileId,
        entityType: "profile",
        title: match.fullName,
        subtitle: match.organisationName,
        rank: 0.95 - index * 0.001,
        href: `/profiles/${match.profileId}`,
        profileId: match.profileId,
        contextLabel: ENTITY_LABELS.profile,
        matchReason: match.reason || undefined,
      });
    });
  }

  const activityIds = activities.map((row) => row.id);
  const eventIds = events.map((row) => row.id);
  const threadIds = emailBodies.map((message) => message.thread_id);

  const [
    profileEnrichment,
    activityEnrichment,
    eventEnrichment,
    threadEnrichment,
    allowedEventIds,
  ] = await Promise.all([
    enrichProfiles([...profileIds]),
    enrichActivities(activityIds),
    enrichEvents(eventIds),
    enrichThreads(threadIds),
    allowedProfileIds
      ? eventIdsWithAllowedAttendee(eventIds, allowedProfileIds, orgId)
      : Promise.resolve(null),
  ]);

  for (const result of results) {
    if (result.entityType !== "profile" || !result.profileId) {
      continue;
    }
    const enrichment = profileEnrichment.get(result.profileId);
    if (enrichment) {
      result.primaryOwnerName = enrichment.primaryOwnerName;
      result.lastInteractionAt = enrichment.lastInteractionAt;
    }
  }

  for (const row of activities) {
    const enrichment = activityEnrichment.get(row.id);
    results.push({
      id: row.id,
      entityType: "activity",
      title: row.title ?? "Activity",
      subtitle: enrichment?.summary ?? row.subtitle,
      rank: 0.8,
      href: enrichment
        ? `/profiles/${enrichment.profileId}?tab=activity`
        : "/profiles",
      profileId: enrichment?.profileId,
      activityDate: enrichment?.activityDate,
      contextLabel: ENTITY_LABELS.activity,
    });
  }

  for (const row of events) {
    const enrichment = eventEnrichment.get(row.id);
    results.push({
      id: row.id,
      entityType: "event",
      title: row.title ?? "Event",
      subtitle: row.subtitle,
      rank: 0.7,
      href: `/events/${row.id}`,
      eventDate: enrichment?.eventDate,
      contextLabel: ENTITY_LABELS.event,
    });
  }

  for (const row of threads) {
    results.push({
      id: row.id,
      entityType: "thread",
      title: row.title ?? "Email thread",
      subtitle: row.subtitle,
      rank: 0.6,
      href: "/profiles",
      contextLabel: ENTITY_LABELS.thread,
    });
  }

  for (const message of emailBodies) {
    const thread = threadEnrichment.get(message.thread_id);
    results.push({
      id: message.id,
      entityType: "message",
      title: thread?.subject ?? message.gmail_message_id,
      subtitle: message.sent_at ? `Sent ${message.sent_at}` : null,
      rank: message.rank,
      href: "/profiles",
      contextLabel: ENTITY_LABELS.message,
    });
  }

  return applyProfileFilters(results, allowedProfileIds, allowedEventIds)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, OVERALL_LIMIT);
}

export function groupSearchResults(
  results: SearchResult[],
): Record<SearchEntityType, SearchResult[]> {
  const groups: Record<SearchEntityType, SearchResult[]> = {
    profile: [],
    activity: [],
    event: [],
    thread: [],
    message: [],
  };

  for (const result of results) {
    groups[result.entityType].push(result);
  }

  return groups;
}

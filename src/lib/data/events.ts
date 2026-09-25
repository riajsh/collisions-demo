import "server-only";

import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getOrgId, requireUser } from "@/lib/auth/session";
import { inferCoAttendanceForEvent } from "@/lib/computed/infer-connections";
import { formatInteractionDate } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";
import type {
  AddEventAttendeeInput,
  AddEventAttendeesBulkInput,
  CreateEventInput,
  UpdateEventInput,
} from "@/lib/validators/events";
import type { Database } from "@/types/database";

type EventType = Database["public"]["Enums"]["event_type"];

export type EventListItem = {
  id: string;
  title: string;
  description: string | null;
  eventType: EventType;
  eventDate: string;
  location: string | null;
  attendeeCount: number;
};

export type EventAttendee = {
  id: string;
  profileId: string;
  fullName: string;
  organisationName: string | null;
  attended: boolean;
};

export type EventDetail = EventListItem & {
  attendees: EventAttendee[];
};

async function assertEventInOrg(eventId: string, orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, event_date")
    .eq("id", eventId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify event: ${error.message}`);
  }

  if (!data) {
    throw new Error("Event not found");
  }

  return data;
}

async function assertProfileInOrg(profileId: string, orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify profile: ${error.message}`);
  }

  if (!data) {
    throw new Error("Profile not found");
  }
}

async function getOrCreateRelationship(
  profileId: string,
  orgId: string,
  createdBy: string,
  supabaseOverride?: SupabaseClient<Database>,
): Promise<string> {
  const supabase = supabaseOverride ?? (await createClient());

  const { data: existing, error: existingError } = await supabase
    .from("relationships")
    .select("id")
    .eq("profile_id", profileId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load relationship: ${existingError.message}`);
  }

  if (existing) {
    return existing.id;
  }

  const { data: created, error: createError } = await supabase
    .from("relationships")
    .insert({
      org_id: orgId,
      profile_id: profileId,
      status: "prospect",
      relationship_type: "other",
    })
    .select("id")
    .single();

  if (createError) {
    throw new Error(`Failed to create relationship: ${createError.message}`);
  }

  const { error: sourceError } = await supabase
    .from("relationship_sources")
    .insert({
      org_id: orgId,
      relationship_id: created.id,
      source_type: "manual",
      source_label: "Relationship created manually",
      created_by: createdBy,
    });

  if (sourceError) {
    throw new Error(
      `Failed to create relationship source: ${sourceError.message}`,
    );
  }

  return created.id;
}

export async function ensureEventAttendanceEvidence(
  orgId: string,
  event: { id: string; title: string; event_date: string },
  profileId: string,
  userId: string,
  supabaseOverride?: SupabaseClient<Database>,
) {
  const supabase = supabaseOverride ?? (await createClient());

  const { data: existingActivity, error: activityLookupError } = await supabase
    .from("activities")
    .select("id")
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .eq("source", "event_system")
    .eq("source_ref", event.id)
    .maybeSingle();

  if (activityLookupError) {
    throw new Error(
      `Failed to check event activity: ${activityLookupError.message}`,
    );
  }

  if (!existingActivity) {
    const { error: activityError } = await supabase.from("activities").insert({
      org_id: orgId,
      profile_id: profileId,
      activity_type: "event",
      title: event.title,
      summary: `Attended ${formatInteractionDate(event.event_date)}`,
      activity_date: event.event_date,
      source: "event_system",
      source_ref: event.id,
      created_by: userId,
    });

    if (activityError) {
      throw new Error(`Failed to create event activity: ${activityError.message}`);
    }
  }

  const relationshipId = await getOrCreateRelationship(
    profileId,
    orgId,
    userId,
    supabase,
  );

  const { data: existingSource, error: sourceLookupError } = await supabase
    .from("relationship_sources")
    .select("id")
    .eq("relationship_id", relationshipId)
    .eq("source_type", "event_attendance")
    .eq("source_id", event.id)
    .maybeSingle();

  if (sourceLookupError) {
    throw new Error(
      `Failed to check event source: ${sourceLookupError.message}`,
    );
  }

  if (!existingSource) {
    const { error: sourceError } = await supabase
      .from("relationship_sources")
      .insert({
        org_id: orgId,
        relationship_id: relationshipId,
        source_type: "event_attendance",
        source_id: event.id,
        source_label: `Attended ${event.title}`,
        created_by: userId,
      });

    if (sourceError) {
      throw new Error(
        `Failed to create event relationship source: ${sourceError.message}`,
      );
    }
  }
}

async function removeEventAttendanceEvidence(
  orgId: string,
  eventId: string,
  profileId: string,
) {
  const supabase = await createClient();

  const { error: activityError } = await supabase
    .from("activities")
    .delete()
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .eq("source", "event_system")
    .eq("source_ref", eventId);

  if (activityError) {
    throw new Error(`Failed to remove event activity: ${activityError.message}`);
  }
}

function mapEventRow(
  event: {
    id: string;
    title: string;
    description: string | null;
    event_type: EventType;
    event_date: string;
    location: string | null;
    event_attendees?: Array<{ count: number }>;
  },
): EventListItem {
  const countRow = event.event_attendees?.[0] as { count: number } | undefined;

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    eventType: event.event_type,
    eventDate: event.event_date,
    location: event.location,
    attendeeCount: countRow?.count ?? 0,
  };
}

async function listEventIdsForOwner(
  orgId: string,
  ownerUserId: string,
): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("event_attendees")
    .select(
      `
      event_id,
      profiles!inner (
        relationships!inner (
          relationship_owners!inner (
            user_id
          )
        )
      )
    `,
    )
    .eq("org_id", orgId)
    .eq("profiles.relationships.relationship_owners.user_id", ownerUserId);

  if (error) {
    throw new Error(`Failed to list owner events: ${error.message}`);
  }

  return [...new Set((data ?? []).map((row) => row.event_id))];
}

export async function listEvents(): Promise<EventListItem[]> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("events")
    .select(
      `
      id,
      title,
      description,
      event_type,
      event_date,
      location,
      event_attendees (count)
    `,
    )
    .eq("org_id", orgId)
    .order("event_date", { ascending: false });

  if (error) {
    throw new Error(`Failed to list events: ${error.message}`);
  }

  return (data ?? []).map(mapEventRow);
}

export async function getEventById(id: string): Promise<EventDetail> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("events")
    .select(
      `
      id,
      title,
      description,
      event_type,
      event_date,
      location,
      event_attendees (
        id,
        attended,
        profiles (
          id,
          full_name,
          organisation_name
        )
      )
    `,
    )
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load event: ${error.message}`);
  }

  if (!data) {
    notFound();
  }

  const attendees = (data.event_attendees ?? [])
    .map((row) => {
      const profile = row.profiles;
      if (!profile) {
        return null;
      }

      return {
        id: row.id,
        profileId: profile.id,
        fullName: profile.full_name,
        organisationName: profile.organisation_name,
        attended: row.attended,
      };
    })
    .filter((row): row is EventAttendee => row !== null)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    eventType: data.event_type,
    eventDate: data.event_date,
    location: data.location,
    attendeeCount: attendees.length,
    attendees,
  };
}

export async function createEvent(input: CreateEventInput): Promise<EventListItem> {
  await requireUser();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("events")
    .insert({
      org_id: orgId,
      title: input.title,
      description: input.description ?? null,
      event_type: input.eventType,
      event_date: new Date(input.eventDate).toISOString(),
      location: input.location ?? null,
    })
    .select("id, title, description, event_type, event_date, location")
    .single();

  if (error) {
    throw new Error(`Failed to create event: ${error.message}`);
  }

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    eventType: data.event_type,
    eventDate: data.event_date,
    location: data.location,
    attendeeCount: 0,
  };
}

export async function updateEvent(input: UpdateEventInput): Promise<void> {
  await requireUser();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const existingEvent = await assertEventInOrg(input.eventId, orgId);

  const { error } = await supabase
    .from("events")
    .update({
      title: input.title,
      description: input.description ?? null,
      event_type: input.eventType,
      event_date: new Date(input.eventDate).toISOString(),
      location: input.location ?? null,
    })
    .eq("id", input.eventId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to update event: ${error.message}`);
  }

  if (existingEvent.title !== input.title) {
    await renameEventAttendeeTag(supabase, orgId, existingEvent.title, input.title);
  }
}

/**
 * Every attendee tagged via an event-attached upload (or the bulk "add to
 * event" action) gets a tag literally named after the event's title at that
 * moment — it's not a live reference back to the event. So renaming an
 * event leaves everyone's tag showing the old name unless we also rename
 * the tag here. If a tag with the new name already exists (e.g. it
 * coincidentally matches another event), merge into it instead of failing.
 */
async function renameEventAttendeeTag(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  oldTitle: string,
  newTitle: string,
): Promise<void> {
  const { data: oldTag } = await supabase
    .from("tags")
    .select("id")
    .eq("org_id", orgId)
    .eq("category", "events")
    .eq("name", oldTitle)
    .maybeSingle();

  if (!oldTag) {
    // No one was ever tagged under the old name — nothing to rename.
    return;
  }

  const { error: renameError } = await supabase
    .from("tags")
    .update({ name: newTitle })
    .eq("id", oldTag.id)
    .eq("org_id", orgId);

  if (!renameError) {
    return;
  }

  const { data: existingNewTag } = await supabase
    .from("tags")
    .select("id")
    .eq("org_id", orgId)
    .eq("name", newTitle)
    .maybeSingle();

  if (!existingNewTag) {
    throw new Error(`Failed to rename event tag: ${renameError.message}`);
  }

  const { data: linkedProfiles } = await supabase
    .from("profile_tags")
    .select("profile_id")
    .eq("org_id", orgId)
    .eq("tag_id", oldTag.id);

  for (const { profile_id: profileId } of linkedProfiles ?? []) {
    const { data: alreadyLinked } = await supabase
      .from("profile_tags")
      .select("id")
      .eq("org_id", orgId)
      .eq("profile_id", profileId)
      .eq("tag_id", existingNewTag.id)
      .maybeSingle();

    if (!alreadyLinked) {
      await supabase.from("profile_tags").insert({
        org_id: orgId,
        profile_id: profileId,
        tag_id: existingNewTag.id,
      });
    }
  }

  await supabase
    .from("profile_tags")
    .delete()
    .eq("org_id", orgId)
    .eq("tag_id", oldTag.id);
  await supabase.from("tags").delete().eq("id", oldTag.id).eq("org_id", orgId);
}

export async function addEventAttendee(
  input: AddEventAttendeeInput,
): Promise<void> {
  const user = await requireUser();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const event = await assertEventInOrg(input.eventId, orgId);
  await assertProfileInOrg(input.profileId, orgId);

  const { error } = await supabase.from("event_attendees").upsert(
    {
      org_id: orgId,
      event_id: input.eventId,
      profile_id: input.profileId,
      attended: input.attended,
    },
    { onConflict: "event_id,profile_id" },
  );

  if (error) {
    throw new Error(`Failed to add attendee: ${error.message}`);
  }

  await ensureEventAttendanceEvidence(orgId, event, input.profileId, user.id);

  try {
    await inferCoAttendanceForEvent(input.eventId);
  } catch {
    // Co-attendance inference is best-effort when adding attendees.
  }
}

export type AddEventAttendeesBulkResult = {
  added: number;
  tagged: number;
  tagWarning: string | null;
};

export type FindOrCreateEventTagResult = {
  tagId: string | null;
  warning: string | null;
};

/**
 * Finds (or creates) the "events"-category tag named after an event's
 * title. Shared by the bulk "add to event" action, CSV import commit, and
 * Eventbrite attendee sync — all three tag attendees with the event name
 * the same way.
 */
export async function findOrCreateEventTag(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  eventTitle: string,
): Promise<FindOrCreateEventTagResult> {
  const { data: existingTag, error: tagLookupError } = await supabase
    .from("tags")
    .select("id")
    .eq("org_id", orgId)
    .eq("name", eventTitle)
    .maybeSingle();

  if (tagLookupError) {
    return { tagId: null, warning: "The event tag couldn't be checked." };
  }

  if (existingTag) {
    return { tagId: existingTag.id, warning: null };
  }

  const { data: createdTag, error: createTagError } = await supabase
    .from("tags")
    .insert({ org_id: orgId, name: eventTitle, category: "events" })
    .select("id")
    .single();

  if (!createTagError) {
    return { tagId: createdTag.id, warning: null };
  }

  if (createTagError.code === "23505") {
    // Someone else (e.g. an import committing at the same time) created
    // this tag a moment earlier — just reuse it.
    const { data: raceTag } = await supabase
      .from("tags")
      .select("id")
      .eq("org_id", orgId)
      .eq("name", eventTitle)
      .maybeSingle();

    if (raceTag) {
      return { tagId: raceTag.id, warning: null };
    }

    return { tagId: null, warning: "The event tag couldn't be created." };
  }

  return {
    tagId: null,
    warning:
      "Tagging didn't work — the database may still need the \"Events\" tag category added.",
  };
}

/** Links a profile to a tag if not already linked. Returns true on success. */
export async function linkProfileToTag(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  profileId: string,
  tagId: string,
): Promise<boolean> {
  const { data: existingProfileTag } = await supabase
    .from("profile_tags")
    .select("id")
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .eq("tag_id", tagId)
    .maybeSingle();

  if (existingProfileTag) {
    return true;
  }

  const { error: linkError } = await supabase.from("profile_tags").insert({
    org_id: orgId,
    profile_id: profileId,
    tag_id: tagId,
  });

  return !linkError;
}

export async function addEventAttendeesBulk(
  input: AddEventAttendeesBulkInput,
): Promise<AddEventAttendeesBulkResult> {
  const user = await requireUser();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const event = await assertEventInOrg(input.eventId, orgId);
  const uniqueProfileIds = [...new Set(input.profileIds)];

  let tagId: string | null = null;
  let tagWarning: string | null = null;

  if (input.tagWithEvent) {
    const tagResult = await findOrCreateEventTag(supabase, orgId, event.title);
    tagId = tagResult.tagId;
    if (tagResult.warning) {
      tagWarning = `Attendees were added, but ${tagResult.warning.charAt(0).toLowerCase()}${tagResult.warning.slice(1)}`;
    }
  }

  let added = 0;
  let tagged = 0;

  for (const profileId of uniqueProfileIds) {
    await assertProfileInOrg(profileId, orgId);

    const { error } = await supabase.from("event_attendees").upsert(
      {
        org_id: orgId,
        event_id: input.eventId,
        profile_id: profileId,
        attended: true,
      },
      { onConflict: "event_id,profile_id" },
    );

    if (error) {
      throw new Error(`Failed to add attendee: ${error.message}`);
    }

    added += 1;
    await ensureEventAttendanceEvidence(orgId, event, profileId, user.id);

    if (tagId) {
      const linked = await linkProfileToTag(supabase, orgId, profileId, tagId);
      if (linked) {
        tagged += 1;
      } else if (!tagWarning) {
        tagWarning = "Attendees were added, but some tags couldn't be linked.";
      }
    }
  }

  try {
    await inferCoAttendanceForEvent(input.eventId);
  } catch {
    // Co-attendance inference is best-effort when adding attendees.
  }

  return { added, tagged, tagWarning };
}

export async function markEventAttendeeAttended(
  eventId: string,
  profileId: string,
  attended: boolean,
): Promise<void> {
  await requireUser();
  const orgId = await getOrgId();
  const supabase = await createClient();

  await assertEventInOrg(eventId, orgId);
  await assertProfileInOrg(profileId, orgId);

  const { error } = await supabase
    .from("event_attendees")
    .update({ attended })
    .eq("org_id", orgId)
    .eq("event_id", eventId)
    .eq("profile_id", profileId);

  if (error) {
    throw new Error(`Failed to update attendance: ${error.message}`);
  }
}

export async function removeEventAttendee(
  eventId: string,
  profileId: string,
): Promise<void> {
  await requireUser();
  const orgId = await getOrgId();
  const supabase = await createClient();

  await assertEventInOrg(eventId, orgId);
  await assertProfileInOrg(profileId, orgId);

  const { error } = await supabase
    .from("event_attendees")
    .delete()
    .eq("org_id", orgId)
    .eq("event_id", eventId)
    .eq("profile_id", profileId);

  if (error) {
    throw new Error(`Failed to remove attendee: ${error.message}`);
  }

  await removeEventAttendanceEvidence(orgId, eventId, profileId);
}

export async function deleteEvent(eventId: string): Promise<void> {
  await requireUser();
  const orgId = await getOrgId();
  const supabase = await createClient();

  await assertEventInOrg(eventId, orgId);

  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to delete event: ${error.message}`);
  }
}

export async function listUpcomingEvents(
  limit = 5,
  options?: { ownerUserId?: string },
): Promise<EventListItem[]> {
  const orgId = await getOrgId();
  const supabase = await createClient();
  const ownerUserId = options?.ownerUserId;

  let query = supabase
    .from("events")
    .select(
      `
      id,
      title,
      description,
      event_type,
      event_date,
      location,
      event_attendees (count)
    `,
    )
    .eq("org_id", orgId)
    .gte("event_date", new Date().toISOString());

  if (ownerUserId) {
    const eventIds = await listEventIdsForOwner(orgId, ownerUserId);
    if (eventIds.length === 0) {
      return [];
    }
    query = query.in("id", eventIds);
  }

  const { data, error } = await query
    .order("event_date", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list upcoming events: ${error.message}`);
  }

  return (data ?? []).map(mapEventRow);
}

export async function listRecentPastEvents(
  limit = 5,
  options?: { ownerUserId?: string },
): Promise<EventListItem[]> {
  const orgId = await getOrgId();
  const supabase = await createClient();
  const ownerUserId = options?.ownerUserId;

  let query = supabase
    .from("events")
    .select(
      `
      id,
      title,
      description,
      event_type,
      event_date,
      location,
      event_attendees (count)
    `,
    )
    .eq("org_id", orgId)
    .lt("event_date", new Date().toISOString());

  if (ownerUserId) {
    const eventIds = await listEventIdsForOwner(orgId, ownerUserId);
    if (eventIds.length === 0) {
      return [];
    }
    query = query.in("id", eventIds);
  }

  const { data, error } = await query
    .order("event_date", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list recent events: ${error.message}`);
  }

  return (data ?? []).map(mapEventRow);
}

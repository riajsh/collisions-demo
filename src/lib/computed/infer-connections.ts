import "server-only";

import { getOrgId, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

function orderProfileIds(
  profileAId: string,
  profileBId: string,
): [string, string] {
  return profileAId < profileBId
    ? [profileAId, profileBId]
    : [profileBId, profileAId];
}

export type InferenceResult = {
  created: number;
  skipped: number;
};

async function insertInferredConnection(
  orgId: string,
  profileAId: string,
  profileBId: string,
  input: {
    connectionType: Database["public"]["Enums"]["connection_type"];
    source: Database["public"]["Enums"]["connection_source"];
    sourceEventId?: string;
    notes: string;
  },
): Promise<"created" | "skipped"> {
  const supabase = await createClient();
  const [a, b] = orderProfileIds(profileAId, profileBId);

  const { error } = await supabase.from("connections").insert({
    org_id: orgId,
    profile_a_id: a,
    profile_b_id: b,
    connection_type: input.connectionType,
    strength: "unknown",
    source: input.source,
    source_event_id: input.sourceEventId ?? null,
    notes: input.notes,
  });

  if (error) {
    if (error.code === "23505") {
      return "skipped";
    }
    throw new Error(`Failed to infer connection: ${error.message}`);
  }

  return "created";
}

async function inferPairs(
  orgId: string,
  profileIds: string[],
  input: {
    connectionType: Database["public"]["Enums"]["connection_type"];
    source: Database["public"]["Enums"]["connection_source"];
    sourceEventId?: string;
    notes: string;
  },
): Promise<InferenceResult> {
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < profileIds.length; i += 1) {
    for (let j = i + 1; j < profileIds.length; j += 1) {
      const outcome = await insertInferredConnection(
        orgId,
        profileIds[i],
        profileIds[j],
        input,
      );

      if (outcome === "created") {
        created += 1;
      } else {
        skipped += 1;
      }
    }
  }

  return { created, skipped };
}

export async function inferCoAttendanceForEvent(
  eventId: string,
): Promise<InferenceResult> {
  await requireUser();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select(
      `
      id,
      title,
      event_attendees (
        profile_id
      )
    `,
    )
    .eq("org_id", orgId)
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    throw new Error(`Failed to load event for inference: ${eventError.message}`);
  }

  if (!event) {
    throw new Error("Event not found");
  }

  const profileIds = (event.event_attendees ?? []).map(
    (row) => row.profile_id,
  );

  if (profileIds.length < 2) {
    return { created: 0, skipped: 0 };
  }

  return inferPairs(orgId, profileIds, {
    connectionType: "met_at_event",
    source: "inferred_event",
    sourceEventId: event.id,
    notes: `Co-attended ${event.title}`,
  });
}

export async function inferCoAttendanceForOrg(): Promise<InferenceResult> {
  await requireUser();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data: events, error } = await supabase
    .from("events")
    .select("id")
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to list events for inference: ${error.message}`);
  }

  const results = await Promise.all(
    (events ?? []).map((event) => inferCoAttendanceForEvent(event.id)),
  );

  return results.reduce(
    (acc, result) => ({
      created: acc.created + result.created,
      skipped: acc.skipped + result.skipped,
    }),
    { created: 0, skipped: 0 },
  );
}

export async function inferSameCompanyConnections(): Promise<InferenceResult> {
  await requireUser();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, organisation_name, organisation_name_normalised")
    .eq("org_id", orgId)
    .not("organisation_name_normalised", "is", null);

  if (error) {
    throw new Error(
      `Failed to load profiles for company inference: ${error.message}`,
    );
  }

  const groups = new Map<
    string,
    Array<{ id: string; organisationName: string | null }>
  >();

  for (const profile of data ?? []) {
    const key = profile.organisation_name_normalised;
    if (!key) {
      continue;
    }

    const group = groups.get(key) ?? [];
    group.push({
      id: profile.id,
      organisationName: profile.organisation_name,
    });
    groups.set(key, group);
  }

  let created = 0;
  let skipped = 0;

  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }

    const label =
      group.find((profile) => profile.organisationName)?.organisationName ??
      "same company";

    const result = await inferPairs(
      orgId,
      group.map((profile) => profile.id),
      {
        connectionType: "colleague",
        source: "inferred_company",
        notes: `Same company: ${label}`,
      },
    );

    created += result.created;
    skipped += result.skipped;
  }

  return { created, skipped };
}

export async function inferAllConnections(): Promise<InferenceResult> {
  await requireUser();

  const [company, events] = await Promise.all([
    inferSameCompanyConnections(),
    inferCoAttendanceForOrg(),
  ]);

  return {
    created: company.created + events.created,
    skipped: company.skipped + events.skipped,
  };
}

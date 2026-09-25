import "server-only";

import { getOrgId, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { CreateManualConnectionInput } from "@/lib/validators/connections";
import type { Database } from "@/types/database";

type ConnectionType = Database["public"]["Enums"]["connection_type"];
type ConnectionSource = Database["public"]["Enums"]["connection_source"];

export type EventConnection = {
  id: string;
  profileAId: string;
  profileAName: string;
  profileBId: string;
  profileBName: string;
  connectionType: ConnectionType;
  source: ConnectionSource;
  notes: string | null;
};

function orderProfileIds(
  profileAId: string,
  profileBId: string,
): [string, string] {
  return profileAId < profileBId
    ? [profileAId, profileBId]
    : [profileBId, profileAId];
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

export async function createManualConnection(
  input: CreateManualConnectionInput,
): Promise<void> {
  await requireUser();
  const orgId = await getOrgId();
  const supabase = await createClient();

  await assertProfileInOrg(input.profileId, orgId);
  await assertProfileInOrg(input.otherProfileId, orgId);

  if (input.introducedBy) {
    const { data: introducer, error: introducerError } = await supabase
      .from("users")
      .select("id")
      .eq("id", input.introducedBy)
      .eq("org_id", orgId)
      .maybeSingle();

    if (introducerError) {
      throw new Error(`Failed to verify introducer: ${introducerError.message}`);
    }

    if (!introducer) {
      throw new Error("Introducer not found");
    }
  }

  const [profileAId, profileBId] = orderProfileIds(
    input.profileId,
    input.otherProfileId,
  );

  const { error } = await supabase.from("connections").insert({
    org_id: orgId,
    profile_a_id: profileAId,
    profile_b_id: profileBId,
    connection_type: input.connectionType,
    strength: input.strength,
    source: "manual",
    introduced_by:
      input.connectionType === "introduced" ? input.introducedBy : null,
    notes: input.notes ?? null,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("This connection already exists.");
    }
    throw new Error(`Failed to create connection: ${error.message}`);
  }
}

export async function removeManualConnection(
  profileId: string,
  connectionId: string,
): Promise<void> {
  await requireUser();
  const orgId = await getOrgId();
  const supabase = await createClient();

  await assertProfileInOrg(profileId, orgId);

  const { data: connection, error: lookupError } = await supabase
    .from("connections")
    .select("id, source, profile_a_id, profile_b_id")
    .eq("id", connectionId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to load connection: ${lookupError.message}`);
  }

  if (!connection) {
    throw new Error("Connection not found");
  }

  if (connection.source !== "manual") {
    throw new Error("Only manual connections can be removed");
  }

  if (
    connection.profile_a_id !== profileId &&
    connection.profile_b_id !== profileId
  ) {
    throw new Error("Connection not found on this profile");
  }

  const { error } = await supabase
    .from("connections")
    .delete()
    .eq("id", connectionId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to remove connection: ${error.message}`);
  }
}

export async function listEventConnections(
  eventId: string,
): Promise<EventConnection[]> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("connections")
    .select(
      `
      id,
      connection_type,
      source,
      notes,
      profile_a_id,
      profile_b_id,
      profile_a:profiles!connections_profile_a_id_fkey (
        id,
        full_name
      ),
      profile_b:profiles!connections_profile_b_id_fkey (
        id,
        full_name
      )
    `,
    )
    .eq("org_id", orgId)
    .eq("source_event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list event connections: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const profileA = row.profile_a as { id: string; full_name: string } | null;
    const profileB = row.profile_b as { id: string; full_name: string } | null;

    return {
      id: row.id,
      profileAId: row.profile_a_id,
      profileAName: profileA?.full_name ?? "Unknown",
      profileBId: row.profile_b_id,
      profileBName: profileB?.full_name ?? "Unknown",
      connectionType: row.connection_type,
      source: row.source,
      notes: row.notes,
    };
  });
}

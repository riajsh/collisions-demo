import "server-only";

import {
  OVERVIEW_RECENT_ACTIVITY_SOURCES,
  pastActivityCutoffIso,
} from "@/lib/activities/past-only";
import { getOrgId, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { CreateManualActivityInput } from "@/lib/validators/activities";
import type { Database } from "@/types/database";

type ActivityType = Database["public"]["Enums"]["activity_type"];
type ActivitySource = Database["public"]["Enums"]["activity_source"];

export type CreatedActivity = {
  id: string;
  profileId: string;
  activityType: ActivityType;
  title: string;
  summary: string | null;
  activityDate: string;
};

export type RecentActivityItem = {
  id: string;
  profileId: string;
  profileName: string;
  activityType: ActivityType;
  title: string;
  activityDate: string;
  source: ActivitySource;
};

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

async function bumpOwnerLastInteraction(
  profileId: string,
  orgId: string,
  userId: string,
  activityDate: string,
) {
  const supabase = await createClient();

  const { data: relationship, error: relationshipError } = await supabase
    .from("relationships")
    .select("id")
    .eq("profile_id", profileId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (relationshipError) {
    throw new Error(
      `Failed to load relationship for activity: ${relationshipError.message}`,
    );
  }

  if (!relationship) {
    return;
  }

  const { data: owner, error: ownerError } = await supabase
    .from("relationship_owners")
    .select("id, last_interaction_at")
    .eq("relationship_id", relationship.id)
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (ownerError) {
    throw new Error(
      `Failed to load relationship owner for activity: ${ownerError.message}`,
    );
  }

  if (!owner) {
    return;
  }

  if (
    owner.last_interaction_at &&
    new Date(owner.last_interaction_at) >= new Date(activityDate)
  ) {
    return;
  }

  const { error: updateError } = await supabase
    .from("relationship_owners")
    .update({ last_interaction_at: activityDate })
    .eq("id", owner.id)
    .eq("org_id", orgId);

  if (updateError) {
    throw new Error(
      `Failed to update last interaction: ${updateError.message}`,
    );
  }
}

export async function createManualActivity(
  input: CreateManualActivityInput,
): Promise<CreatedActivity> {
  const user = await requireUser();
  const orgId = await getOrgId();
  const supabase = await createClient();

  await assertProfileInOrg(input.profileId, orgId);

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

  const activityDate = new Date(input.activityDate).toISOString();
  const isIntroduction = input.activityType === "introduction";

  const { data, error } = await supabase
    .from("activities")
    .insert({
      org_id: orgId,
      profile_id: input.profileId,
      activity_type: input.activityType,
      title: input.title,
      summary: input.summary ?? null,
      activity_date: activityDate,
      source: "manual",
      created_by: user.id,
      introduced_by: isIntroduction ? input.introducedBy : null,
      introduction_outcome: isIntroduction
        ? (input.introductionOutcome ?? "pending")
        : null,
    })
    .select("id, profile_id, activity_type, title, summary, activity_date")
    .single();

  if (error) {
    throw new Error(`Failed to log activity: ${error.message}`);
  }

  await bumpOwnerLastInteraction(input.profileId, orgId, user.id, activityDate);

  return {
    id: data.id,
    profileId: data.profile_id,
    activityType: data.activity_type,
    title: data.title,
    summary: data.summary,
    activityDate: data.activity_date,
  };
}

export async function listRecentOrgActivities(
  limit = 10,
  options?: { ownerUserId?: string },
): Promise<RecentActivityItem[]> {
  const orgId = await getOrgId();
  const supabase = await createClient();
  const ownerUserId = options?.ownerUserId;

  const profileSelect = ownerUserId
    ? `profiles!inner (
        id,
        full_name,
        relationships!inner (
          relationship_owners!inner (
            user_id
          )
        )
      )`
    : `profiles (
        id,
        full_name
      )`;

  let query = supabase
    .from("activities")
    .select(
      `
      id,
      activity_type,
      title,
      activity_date,
      source,
      ${profileSelect}
    `,
    )
    .eq("org_id", orgId)
    .in("source", OVERVIEW_RECENT_ACTIVITY_SOURCES)
    .lte("activity_date", pastActivityCutoffIso());

  if (ownerUserId) {
    query = query.eq(
      "profiles.relationships.relationship_owners.user_id",
      ownerUserId,
    );
  }

  const { data, error } = await query
    .order("activity_date", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list recent activity: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => {
      const profile = row.profiles;
      if (!profile) {
        return null;
      }

      return {
        id: row.id,
        profileId: profile.id,
        profileName: profile.full_name,
        activityType: row.activity_type,
        title: row.title,
        activityDate: row.activity_date,
        source: row.source,
      };
    })
    .filter((row): row is RecentActivityItem => row !== null);
}

import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/app-shell/breadcrumbs";
import { ProfileDetailView } from "@/components/profiles/profile-detail-view";
import { getProfileById } from "@/lib/data/profiles";
import { getProfileEnrichmentSuggestions } from "@/lib/enrichment/profile-enrichment";
import { getProfileNetworkIntel } from "@/lib/computed/profile-intelligence";
import { listOrgTags } from "@/lib/data/tags";
import { listOrgUsers } from "@/lib/data/users";
import { requireUser } from "@/lib/auth/session";

type ProfilePageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }

  const [profile, teamUsers, orgTags, currentUser, networkIntel, enrichmentSuggestions] =
    await Promise.all([
      getProfileById(id),
      listOrgUsers(),
      listOrgTags(),
      requireUser(),
      getProfileNetworkIntel(id),
      getProfileEnrichmentSuggestions(id),
    ]);

  return (
    <>
      <div className="border-b border-border px-8 pt-6">
        <Breadcrumbs
          items={[
            { label: "Profiles", href: "/profiles" },
            { label: profile.fullName },
          ]}
        />
      </div>
      <ProfileDetailView
        profile={profile}
        teamUsers={teamUsers}
        orgTags={orgTags}
        networkIntel={networkIntel}
        enrichmentSuggestions={enrichmentSuggestions}
        currentUserId={currentUser.id}
        mode="page"
      />
    </>
  );
}

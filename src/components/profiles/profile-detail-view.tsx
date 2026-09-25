import { Suspense } from "react";

import { EditProfileForm } from "@/components/profiles/edit-profile-form";
import { RelationshipContextSection } from "@/components/profiles/relationship-context-section";
import { ProfileTimeline } from "@/components/profiles/profile-timeline";
import { ProfileFullPageLink } from "@/components/profiles/profile-full-page-link";
import { ProfileHeader } from "@/components/profiles/profile-header";
import { DeleteProfileButton } from "@/components/profiles/delete-profile-button";
import { ProfileNetworkIntelligence } from "@/components/profiles/profile-network-intelligence";
import { ProfileNotesSection } from "@/components/profiles/profile-notes-section";
import { ProfileOwnersSection } from "@/components/profiles/profile-owners-section";
import { ProfileEnrichmentSuggestions } from "@/components/profiles/profile-enrichment-suggestions";
import { ProfileSummaryHero } from "@/components/profiles/profile-summary-hero";
import type { ProfileNetworkIntel } from "@/lib/computed/profile-intelligence";
import type { ProfileEnrichmentSuggestions as ProfileEnrichmentSuggestionsData } from "@/lib/enrichment/profile-enrichment";
import { ProfileTagsSection } from "@/components/profiles/profile-tags-section";
import { computeProfileSignalCount } from "@/lib/data/profiles";
import type { ProfileDetail } from "@/lib/data/profiles";
import type { OrgTag } from "@/lib/data/tags";
import type { OrgUser } from "@/lib/data/users";

type ProfileDetailViewProps = {
  profile: ProfileDetail;
  teamUsers: OrgUser[];
  orgTags: OrgTag[];
  networkIntel: ProfileNetworkIntel;
  enrichmentSuggestions?: ProfileEnrichmentSuggestionsData;
  enrichMode?: boolean;
  currentUserId: string;
  mode?: "page" | "drawer";
};

export function ProfileDetailView({
  profile,
  teamUsers,
  orgTags,
  networkIntel,
  enrichmentSuggestions,
  enrichMode = false,
  currentUserId,
  mode = "page",
}: ProfileDetailViewProps) {
  return (
    <div className={mode === "drawer" ? "space-y-8" : "space-y-8 px-8 py-6"}>
      <ProfileHeader profile={profile} />

      <ProfileSummaryHero
        profileId={profile.id}
        summary={profile.notesSummary}
        generatedAt={profile.notesSummaryGeneratedAt}
        summarySignalCount={profile.notesSummaryNoteCount}
        currentSignalCount={computeProfileSignalCount(profile)}
      />

      <ProfileNetworkIntelligence
        connections={profile.connections}
        events={profile.events}
        intel={networkIntel}
      />

      <ProfileNotesSection notes={profile.notes} />

      {enrichmentSuggestions && !enrichMode ? (
        <ProfileEnrichmentSuggestions
          profileId={profile.id}
          suggestions={enrichmentSuggestions}
        />
      ) : null}

      {/* Two columns on the full page, where there's room — stacked in the
          drawer, which stays narrow even on a wide screen. */}
      <div className={mode === "page" ? "grid gap-6 lg:grid-cols-2" : "space-y-8"}>
        <section className="space-y-3">
          <h2 className="text-heading font-medium text-foreground">Details</h2>
          <EditProfileForm
            profile={profile}
            enrichMode={enrichMode}
            companySuggestion={enrichmentSuggestions?.company ?? null}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-heading font-medium text-foreground">Relationship context</h2>
          <RelationshipContextSection profile={profile} />
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-heading font-medium text-foreground">Owners</h2>
        <ProfileOwnersSection
          profileId={profile.id}
          owners={profile.owners}
          teamUsers={teamUsers}
          enrichMode={enrichMode}
          ownerSuggestion={enrichmentSuggestions?.owner ?? null}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-heading font-medium text-foreground">Timeline</h2>
        <ProfileTimeline
          key={profile.id}
          profile={profile}
          teamUsers={teamUsers}
          currentUserId={currentUserId}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-heading font-medium text-foreground">Tags</h2>
        <ProfileTagsSection
          profileId={profile.id}
          tags={profile.tags}
          orgTags={orgTags}
        />
      </section>

      {mode === "page" && !profile.isInternalProfile ? (
        <section className="space-y-3 border-t border-border pt-6">
          <h2 className="text-heading font-medium text-foreground">Danger zone</h2>
          <p className="text-body text-muted-foreground">
            Remove this profile if it was created by mistake. Relationship data,
            activities, and tags are deleted with it.
          </p>
          <DeleteProfileButton
            profileId={profile.id}
            profileName={profile.fullName}
            variant="outline"
            className="text-destructive hover:text-destructive"
          />
        </section>
      ) : null}

      {mode === "drawer" ? (
        <div className="border-t border-border pt-4">
          <Suspense fallback={null}>
            <ProfileFullPageLink
              profileId={profile.id}
              className="text-body text-interactive-primary hover:underline"
            >
              View full profile page →
            </ProfileFullPageLink>
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}

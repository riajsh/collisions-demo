import { Badge } from "@/components/ui/badge";
import { updateProfileStatusAction } from "@/app/(app)/profiles/[id]/actions";
import { updateProfileTypeAction } from "@/app/(app)/profiles/[id]/actions";
import { InlineEnumPill } from "@/components/profiles/inline-enum-pill";
import { formatRelativeDate } from "@/lib/format/date";
import { computeFollowUpFlag } from "@/lib/profiles/follow-up-flag";
import type { ProfileDetail } from "@/lib/data/profiles";
import type { Database } from "@/types/database";

type RelationshipStatus = Database["public"]["Enums"]["relationship_status"];
type RelationshipType = Database["public"]["Enums"]["relationship_type"];

const STATUS_OPTIONS: RelationshipStatus[] = [
  "prospect",
  "active",
  "partner",
  "advisor",
  "community",
  "dormant",
  "inactive",
];

const TYPE_OPTIONS: RelationshipType[] = [
  "founder",
  "investor",
  "operator",
  "advisor",
  "partner",
  "sponsor",
  "media",
  "other",
];

type ProfileHeaderProps = {
  profile: ProfileDetail;
};

export function ProfileHeader({ profile }: ProfileHeaderProps) {
  const lastContact = formatRelativeDate(profile.activities[0]?.activityDate ?? null);
  const flag = computeFollowUpFlag(profile);

  return (
    <div className="space-y-3">
      {profile.isInternalProfile ? (
        <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-body text-muted-foreground">
          Team member — calendar sync does not track internal meetings on
          this profile.
        </p>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-display font-medium text-foreground">
              {profile.fullName}
            </h1>
            {profile.tags
              .filter((tag) => tag.category !== "events")
              .map((tag) => (
                <Badge key={tag.id} variant="secondary">
                  {tag.name}
                </Badge>
              ))}
          </div>

          <p className="text-body text-muted-foreground">
            {[profile.occupation, profile.organisationName]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <div className="flex flex-wrap gap-4 text-caption text-muted-foreground">
            {profile.email ? <span>{profile.email}</span> : null}
            {profile.phone ? <span>{profile.phone}</span> : null}
            {profile.linkedinUrl ? (
              <a
                href={profile.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${profile.fullName} on LinkedIn`}
                className="text-interactive-primary hover:underline"
              >
                LinkedIn
              </a>
            ) : null}
            {profile.websiteUrl ? (
              <a
                href={profile.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${profile.fullName} website`}
                className="text-interactive-primary hover:underline"
              >
                Website
              </a>
            ) : null}
          </div>
        </div>

        {profile.relationship ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-caption">
            <InlineEnumPill
              value={profile.relationship.status}
              options={STATUS_OPTIONS}
              variant="solid"
              onSave={updateProfileStatusAction.bind(null, profile.id)}
            />
            <InlineEnumPill
              value={profile.relationship.relationshipType}
              options={TYPE_OPTIONS}
              variant="outline"
              onSave={updateProfileTypeAction.bind(null, profile.id)}
            />
            {lastContact ? (
              <>
                <span className="text-border">·</span>
                <span className="text-muted-foreground">Last contact {lastContact}</span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {flag ? (
        <div className="inline-flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-caption font-medium text-destructive">
          <span aria-hidden="true">●</span>
          {flag.message}
        </div>
      ) : null}
    </div>
  );
}

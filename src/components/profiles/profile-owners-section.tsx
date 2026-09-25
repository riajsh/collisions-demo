"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { AssignOwnerForm } from "@/components/profiles/assign-owner-form";
import { OwnerDot } from "@/components/profiles/owner-dot";
import { ProfileOwnerRow } from "@/components/profiles/profile-owner-row";
import { StrengthBadge } from "@/components/profiles/strength-badge";
import { SuggestedOwnerField } from "@/components/profiles/suggested-owner-field";
import { Button } from "@/components/ui/button";
import type { ProfileOwner } from "@/lib/data/profiles";
import type { OwnerSuggestion } from "@/lib/enrichment/owner-enrichment";
import type { OrgUser } from "@/lib/data/users";
import { cn } from "@/lib/utils";

type ProfileOwnersSectionProps = {
  profileId: string;
  owners: ProfileOwner[];
  teamUsers: OrgUser[];
  enrichMode?: boolean;
  ownerSuggestion?: OwnerSuggestion | null;
};

/**
 * Single line by default — "No owner assigned" or "Owner: {name}
 * ({strength})" — with full owner management (per-owner notes, editing,
 * assigning more) tucked behind an expand toggle rather than always taking
 * up a full card's worth of space.
 */
export function ProfileOwnersSection({
  profileId,
  owners,
  teamUsers,
  enrichMode = false,
  ownerSuggestion = null,
}: ProfileOwnersSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const assignedUserIds = owners.map((owner) => owner.userId);
  const primary = owners.find((owner) => owner.isPrimary) ?? owners[0] ?? null;
  const extraCount = owners.length > 0 ? owners.length - 1 : 0;

  if (owners.length === 0 && !expanded) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-2.5">
        {enrichMode && ownerSuggestion ? (
          <SuggestedOwnerField
            profileId={profileId}
            suggestion={ownerSuggestion}
            teamUsers={teamUsers}
            assignedUserIds={assignedUserIds}
            variant="detail"
          />
        ) : (
          <>
            <span className="text-body text-muted-foreground">No owner assigned</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(true)}>
              Assign owner
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-body text-foreground">
          {primary ? (
            <>
              <OwnerDot userId={primary.userId} />
              <span className="font-medium">{primary.fullName}</span>
              <StrengthBadge strength={primary.strength} />
              {extraCount > 0 ? (
                <span className="text-caption text-muted-foreground">
                  +{extraCount} more
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">No owner assigned</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-border px-4 py-3">
          {owners.map((owner) => (
            <ProfileOwnerRow key={owner.id} profileId={profileId} owner={owner} />
          ))}
          <AssignOwnerForm
            profileId={profileId}
            teamUsers={teamUsers}
            assignedUserIds={assignedUserIds}
          />
        </div>
      ) : null}
    </div>
  );
}

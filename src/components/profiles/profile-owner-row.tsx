"use client";

import { useState } from "react";

import { EditOwnerForm } from "@/components/profiles/edit-owner-form";
import { OwnerDot } from "@/components/profiles/owner-dot";
import { StrengthBadge } from "@/components/profiles/strength-badge";
import { Button } from "@/components/ui/button";
import type { ProfileOwner } from "@/lib/data/profiles";
import { formatInteractionDate } from "@/lib/format/date";

type ProfileOwnerRowProps = {
  profileId: string;
  owner: ProfileOwner;
};

export function ProfileOwnerRow({ profileId, owner }: ProfileOwnerRowProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 px-1">
        <OwnerDot userId={owner.userId} />
        <span className="text-body font-medium text-foreground">
          {owner.fullName}
        </span>
        {owner.isPrimary ? (
          <span className="text-caption text-muted-foreground">Primary</span>
        ) : null}
        <StrengthBadge strength={owner.strength} />
        <span className="text-caption text-muted-foreground">
          Last: {formatInteractionDate(owner.lastInteractionAt)}
        </span>
        {!isEditing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setIsEditing(true)}
          >
            Edit
          </Button>
        ) : null}
      </div>
      {isEditing ? (
        <EditOwnerForm
          key={owner.id}
          profileId={profileId}
          owner={owner}
          onCancel={() => setIsEditing(false)}
          onSaved={() => setIsEditing(false)}
        />
      ) : owner.notes?.trim() ? (
        <p className="px-1 text-body text-muted-foreground whitespace-pre-wrap">
          {owner.notes}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProfilesMergeDialog } from "@/components/profiles/profiles-merge-dialog";
import type { MergeableProfile } from "@/lib/profiles/mergeable-profile";
import { Button } from "@/components/ui/button";
import type { DuplicateProfileGroup } from "@/lib/data/profile-dedup";

type DedupGroupListProps = {
  groups: DuplicateProfileGroup[];
};

export function DedupGroupList({ groups }: DedupGroupListProps) {
  const router = useRouter();
  const [mergeGroup, setMergeGroup] = useState<DuplicateProfileGroup | null>(null);

  if (groups.length === 0) {
    return null;
  }

  const mergeProfiles: MergeableProfile[] =
    mergeGroup?.profiles.map((profile) => ({
      id: profile.id,
      fullName: profile.fullName,
      email: profile.email,
      organisationName: profile.organisationName,
      occupation: profile.occupation,
      canDelete: profile.canDelete,
    })) ?? [];

  return (
    <>
      <ProfilesMergeDialog
        profiles={mergeProfiles}
        open={mergeGroup !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMergeGroup(null);
          }
        }}
        onMerged={() => {
          setMergeGroup(null);
          router.refresh();
        }}
      />
      <ul className="space-y-4">
        {groups.map((group) => (
          <li
            key={group.id}
            className="space-y-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-body font-medium text-foreground">
                  {group.profiles[0]?.fullName}
                  {group.profiles.length > 1
                    ? ` + ${group.profiles.length - 1} more`
                    : ""}
                </p>
                <p className="text-caption text-muted-foreground">
                  {group.profiles.length} profiles · {group.reasonLabel}
                </p>
                {group.hasConflictingEmails ? (
                  <p className="mt-1 text-caption text-amber-700 dark:text-amber-400">
                    Different emails — choose which address to keep when merging.
                  </p>
                ) : null}
              </div>
              {group.profiles.length >= 2 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setMergeGroup(group)}
                >
                  Merge group
                </Button>
              ) : null}
            </div>
            <ul className="space-y-1 text-body text-muted-foreground">
              {group.profiles.map((profile) => (
                <li key={profile.id}>
                  <a
                    href={`/profiles?profile=${profile.id}`}
                    className="hover:text-foreground hover:underline"
                  >
                    {profile.fullName}
                    {profile.email ? ` · ${profile.email}` : ""}
                    {profile.organisationName ? ` · ${profile.organisationName}` : ""}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}

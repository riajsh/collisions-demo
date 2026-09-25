"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { deleteProfilesAction } from "@/app/(app)/profiles/[id]/actions";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import type { ProfileListItem } from "@/lib/data/profiles";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

import { ProfilesMergeDialog } from "./profiles-merge-dialog";

type ProfilesBulkActionsProps = {
  profiles: ProfileListItem[];
  selectedIds: ReadonlySet<string>;
  onClearSelection: () => void;
};

export function ProfilesBulkActions({
  profiles,
  selectedIds,
  onClearSelection,
}: ProfilesBulkActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm, alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [mergeOpen, setMergeOpen] = useState(false);

  const selectedProfiles = useMemo(
    () => profiles.filter((profile) => selectedIds.has(profile.id)),
    [profiles, selectedIds],
  );

  const deletableProfiles = useMemo(
    () => selectedProfiles.filter((profile) => profile.canDelete),
    [selectedProfiles],
  );

  if (selectedIds.size === 0) {
    return null;
  }

  return (
    <>
      <ProfilesMergeDialog
        profiles={selectedProfiles}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        onMerged={(survivorId) => {
          onClearSelection();

          const openProfileId = searchParams.get("profile");
          if (openProfileId && openProfileId !== survivorId) {
            const mergedAway = selectedProfiles.some(
              (profile) => profile.id === openProfileId,
            );
            if (mergedAway) {
              const params = new URLSearchParams(searchParams.toString());
              params.delete("profile");
              const query = params.toString();
              router.replace(query ? `/profiles?${query}` : "/profiles", {
                scroll: false,
              });
            }
          }

          router.refresh();
        }}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <p className="text-body text-foreground">
        {selectedIds.size} selected
        {deletableProfiles.length < selectedIds.size
          ? ` (${deletableProfiles.length} can be deleted)`
          : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {selectedProfiles.length >= 2 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => setMergeOpen(true)}
          >
            Merge profiles
          </Button>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={isPending || deletableProfiles.length === 0}
          onClick={() => {
            void run(async () => {
              const names = deletableProfiles
                .slice(0, 3)
                .map((profile) => profile.fullName)
                .join(", ");
              const remainder = deletableProfiles.length - 3;
              const namePreview =
                remainder > 0 ? `${names}, and ${remainder} more` : names;

              const confirmed = await confirm({
                title: `Delete ${deletableProfiles.length} profile${
                  deletableProfiles.length === 1 ? "" : "s"
                }?`,
                description: `Delete ${namePreview}? Their relationships, activities, and tags will be removed. This cannot be undone.`,
                confirmLabel: `Delete ${deletableProfiles.length} profile${
                  deletableProfiles.length === 1 ? "" : "s"
                }`,
                destructive: true,
              });

              if (!confirmed) {
                return;
              }

              const result = await deleteProfilesAction(
                deletableProfiles.map((profile) => profile.id),
              );

              if ("error" in result && result.error) {
                await alert({
                  title: "Could not delete profiles",
                  description: result.error,
                });
                return;
              }

              if (!("success" in result)) {
                return;
              }

              onClearSelection();

              const openProfileId = searchParams.get("profile");
              if (
                openProfileId &&
                deletableProfiles.some((profile) => profile.id === openProfileId)
              ) {
                const params = new URLSearchParams(searchParams.toString());
                params.delete("profile");
                const query = params.toString();
                router.replace(query ? `/profiles?${query}` : "/profiles", {
                  scroll: false,
                });
              }

              const skipped = result.skipped ?? [];

              if (skipped.length > 0) {
                await alert({
                  title: "Some profiles were not deleted",
                  description: skipped.map((item) => item.reason).join("\n"),
                });
              } else {
                toastSuccess(
                  `Deleted ${result.deletedCount} profile${
                    result.deletedCount === 1 ? "" : "s"
                  }`,
                );
              }

              router.refresh();
            });
          }}
        >
          {isPending ? "Deleting…" : "Delete selected"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={onClearSelection}
        >
          Clear selection
        </Button>
      </div>
    </div>
    </>
  );
}

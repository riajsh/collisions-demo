"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { mergeProfilesAction } from "@/app/(app)/profiles/[id]/actions";
import type { MergeableProfile } from "@/lib/profiles/mergeable-profile";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { handleFocusTrap } from "@/lib/focus-trap";
import {
  collectMergeEmailOptions,
  hasMergeEmailConflict,
} from "@/lib/profiles/merge-email-options";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";
import { cn } from "@/lib/utils";

type ProfilesMergeDialogProps = {
  profiles: MergeableProfile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged: (survivorId: string) => void;
};

function defaultRetainedEmail(
  profiles: MergeableProfile[],
  survivorId: string,
): string | null {
  const emailOptions = collectMergeEmailOptions(profiles);
  const survivorEmail = profiles.find((profile) => profile.id === survivorId)?.email?.trim();

  if (survivorEmail) {
    return survivorEmail;
  }

  return emailOptions[0]?.email ?? null;
}

export function ProfilesMergeDialog({
  profiles,
  open,
  onOpenChange,
  onMerged,
}: ProfilesMergeDialogProps) {
  if (!open || profiles.length < 2) {
    return null;
  }

  return (
    <ProfilesMergeDialogContent
      key={profiles
        .map((profile) => profile.id)
        .sort()
        .join(",")}
      profiles={profiles}
      onOpenChange={onOpenChange}
      onMerged={onMerged}
    />
  );
}

function ProfilesMergeDialogContent({
  profiles,
  onOpenChange,
  onMerged,
}: Omit<ProfilesMergeDialogProps, "open">) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const initialSurvivorId = profiles[0]?.id ?? "";
  const [survivorId, setSurvivorId] = useState(initialSurvivorId);
  const [retainedEmail, setRetainedEmail] = useState<string | null>(() =>
    defaultRetainedEmail(profiles, initialSurvivorId),
  );

  const emailOptions = useMemo(() => collectMergeEmailOptions(profiles), [profiles]);
  const emailConflict = hasMergeEmailConflict(profiles);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        onOpenChange(false);
        return;
      }

      if (event.key === "Tab" && panelRef.current) {
        handleFocusTrap(panelRef.current, event);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isPending, onOpenChange]);

  const duplicateCount = profiles.length - 1;
  const nonSurvivorProfiles = profiles.filter((profile) => profile.id !== survivorId);
  const blockedDuplicates = nonSurvivorProfiles.filter((profile) => !profile.canDelete);
  const canSubmit =
    Boolean(survivorId) &&
    blockedDuplicates.length === 0 &&
    (!emailConflict || Boolean(retainedEmail));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in-0 duration-200"
        aria-hidden="true"
        onClick={() => {
          if (!isPending) {
            onOpenChange(false);
          }
        }}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative flex w-full max-w-xl flex-col rounded-lg border border-border bg-background shadow-xl animate-in fade-in-0 zoom-in-95 duration-200"
      >
        <div className="border-b border-border px-6 py-4">
          <h2 id={titleId} className="text-subheading font-medium text-foreground">
            Merge profiles
          </h2>
          <p id={descriptionId} className="mt-1 text-body text-muted-foreground">
            Choose the primary profile to keep. Activities, owners, connections, and
            tags from the other {duplicateCount} profile
            {duplicateCount === 1 ? "" : "s"} will move into it.
          </p>
        </div>

        <div className="max-h-[min(24rem,60vh)] overflow-auto px-6 py-4">
          <fieldset className="space-y-3">
            <legend className="mb-2 text-caption font-medium text-foreground">
              Primary profile
            </legend>
            {profiles.map((profile) => {
              const isSelected = survivorId === profile.id;

              return (
                <label
                  key={profile.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/20",
                  )}
                >
                  <input
                    type="radio"
                    name="merge-survivor"
                    className="mt-1"
                    checked={isSelected}
                    disabled={isPending}
                    onChange={() => {
                      const nextSurvivorId = profile.id;
                      setSurvivorId(nextSurvivorId);
                      setRetainedEmail(
                        defaultRetainedEmail(profiles, nextSurvivorId),
                      );
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">
                      {profile.fullName}
                    </span>
                    <span className="mt-0.5 block text-caption text-muted-foreground">
                      {[profile.organisationName, profile.occupation]
                        .filter(Boolean)
                        .join(" · ") || "No company or role"}
                    </span>
                    {profile.email ? (
                      <span className="mt-1 block text-caption text-muted-foreground">
                        {profile.email}
                      </span>
                    ) : (
                      <span className="mt-1 block text-caption text-muted-foreground">
                        No email
                      </span>
                    )}
                    {!profile.canDelete ? (
                      <span className="mt-1 block text-caption text-muted-foreground">
                        Team member profile
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {emailConflict ? (
            <fieldset className="mt-6 space-y-3">
              <legend className="mb-2 text-caption font-medium text-foreground">
                Email to keep
              </legend>
              <p className="text-caption text-muted-foreground">
                These profiles have different email addresses. Choose which one the
                merged profile should use.
              </p>
              {emailOptions.map((option) => {
                const isSelected = retainedEmail === option.email;

                return (
                  <label
                    key={option.email}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/20",
                    )}
                  >
                    <input
                      type="radio"
                      name="merge-email"
                      className="mt-1"
                      checked={isSelected}
                      disabled={isPending}
                      onChange={() => setRetainedEmail(option.email)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">
                        {option.email}
                      </span>
                      <span className="mt-0.5 block text-caption text-muted-foreground">
                        From {option.profileName}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ) : null}

          {blockedDuplicates.length > 0 ? (
            <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-caption text-destructive">
              Team member profiles cannot be merged away. Choose a team member as
              primary, or deselect them.
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isPending || !canSubmit}
            onClick={() => {
              void run(async () => {
                const duplicateIds = profiles
                  .map((profile) => profile.id)
                  .filter((profileId) => profileId !== survivorId);

                const result = await mergeProfilesAction(
                  survivorId,
                  duplicateIds,
                  emailConflict ? retainedEmail : undefined,
                );

                if ("error" in result && result.error) {
                  await alert({
                    title: "Could not merge profiles",
                    description: result.error,
                  });
                  return;
                }

                if (!("success" in result)) {
                  return;
                }

                onOpenChange(false);
                onMerged(survivorId);
                toastSuccess(
                  `Merged ${result.mergedCount} profile${
                    result.mergedCount === 1 ? "" : "s"
                  } into the primary profile`,
                );
              });
            }}
          >
            {isPending ? "Merging…" : `Merge ${duplicateCount} into primary`}
          </Button>
        </div>
      </div>
    </div>
  );
}

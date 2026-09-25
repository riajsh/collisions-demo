"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateRelationshipNotesAction } from "@/app/(app)/profiles/[id]/actions";
import { ProfileDetailField } from "@/components/profiles/profile-detail-field";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileDetail } from "@/lib/data/profiles";
import { formatInteractionDate } from "@/lib/format/date";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

type RelationshipContextSectionProps = {
  profile: ProfileDetail;
};

/**
 * Your own free-text read on this person — separate from Status/Type, which
 * now live as pills in the header. Same click-to-edit / free-type / save
 * pattern Jordan asked for: a long text box you can type into and save, with
 * the day it was last logged shown underneath.
 */
export function RelationshipContextSection({
  profile,
}: RelationshipContextSectionProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const relationship = profile.relationship;
  const [isEditing, setIsEditing] = useState(false);

  const currentNotes = relationship?.notes ?? null;
  const [notes, setNotes] = useState(currentNotes ?? "");

  function handleCancel() {
    setNotes(currentNotes ?? "");
    setIsEditing(false);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      {!isEditing ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <ProfileDetailField
              label="Relationship context"
              value={currentNotes}
              multiline
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setNotes(currentNotes ?? "");
                setIsEditing(true);
              }}
            >
              Edit
            </Button>
          </div>
          {currentNotes && relationship?.notesUpdatedAt ? (
            <p className="text-caption text-muted-foreground">
              Logged {formatInteractionDate(relationship.notesUpdatedAt)}
            </p>
          ) : null}
        </>
      ) : (
        <form
          action={(formData) => {
            void run(async () => {
              const result = await updateRelationshipNotesAction(formData);
              if (result.error) {
                await alert({
                  title: "Could not save relationship context",
                  description: result.error,
                });
                return;
              }
              toastSuccess("Relationship context saved");
              setIsEditing(false);
              router.refresh();
            });
          }}
          className="space-y-3"
        >
          <input type="hidden" name="profileId" value={profile.id} />
          <Textarea
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={8}
            placeholder="Your own read on this person — e.g. doesn't reply to emails but likes calls"
          />
          {relationship?.notesUpdatedAt ? (
            <p className="text-caption text-muted-foreground">
              Last logged {formatInteractionDate(relationship.notesUpdatedAt)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending} size="sm">
              {isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

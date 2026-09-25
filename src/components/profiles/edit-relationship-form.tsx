"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateRelationshipAction } from "@/app/(app)/profiles/[id]/actions";
import { ProfileDetailField } from "@/components/profiles/profile-detail-field";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileDetail } from "@/lib/data/profiles";
import { formatEnumLabel } from "@/lib/format/enum";
import { formatInteractionDate } from "@/lib/format/date";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

const STATUS_OPTIONS = [
  "prospect",
  "active",
  "partner",
  "advisor",
  "community",
  "dormant",
  "inactive",
] as const;

const TYPE_OPTIONS = [
  "founder",
  "investor",
  "operator",
  "advisor",
  "partner",
  "sponsor",
  "media",
  "other",
] as const;

type EditRelationshipFormProps = {
  profile: ProfileDetail;
};

export function EditRelationshipForm({ profile }: EditRelationshipFormProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const relationship = profile.relationship;
  const [isEditing, setIsEditing] = useState(false);

  // Profiles created via the Eventbrite review queue don't get a
  // relationship record made automatically the way manually-created ones
  // do, so `relationship` can genuinely be null here — that used to be a
  // dead end ("assign an owner first"). Now it just means "nothing saved
  // yet": these defaults drive the read view, and saving creates the
  // record behind the scenes (see updateRelationship in relationships.ts).
  const currentStatus = relationship?.status ?? "prospect";
  const currentType = relationship?.relationshipType ?? "other";
  const currentNotes = relationship?.notes ?? null;

  const [status, setStatus] = useState<string>(currentStatus);
  const [relationshipType, setRelationshipType] = useState<string>(currentType);
  const [notes, setNotes] = useState(currentNotes ?? "");

  function handleCancel() {
    setStatus(currentStatus);
    setRelationshipType(currentType);
    setNotes(currentNotes ?? "");
    setIsEditing(false);
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      {!isEditing ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setStatus(currentStatus);
              setRelationshipType(currentType);
              setNotes(currentNotes ?? "");
              setIsEditing(true);
            }}
          >
            Edit
          </Button>
        </div>
      ) : null}

      {!isEditing ? (
        <dl className="grid gap-4 sm:grid-cols-2">
          <ProfileDetailField
            label="Status"
            value={formatEnumLabel(currentStatus)}
          />
          <ProfileDetailField
            label="Type"
            value={formatEnumLabel(currentType)}
          />
          <div className="space-y-1 sm:col-span-2">
            <ProfileDetailField
              label="Relationship context"
              value={currentNotes}
              multiline
            />
            {currentNotes && relationship?.notesUpdatedAt ? (
              <p className="text-caption text-muted-foreground">
                Logged {formatInteractionDate(relationship.notesUpdatedAt)}
              </p>
            ) : null}
          </div>
        </dl>
      ) : (
        <form
          action={(formData) => {
            void run(async () => {
              const result = await updateRelationshipAction(formData);
              if (result.error) {
                await alert({ title: "Could not save relationship", description: result.error });
                return;
              }
              toastSuccess("Relationship saved");
              setIsEditing(false);
              router.refresh();
            });
          }}
          className="space-y-4"
        >
          <input type="hidden" name="profileId" value={profile.id} />
          {relationship?.id ? (
            <input type="hidden" name="relationshipId" value={relationship.id} />
          ) : null}
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="relationshipType" value={relationshipType} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="relationship-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="relationship-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {formatEnumLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="relationship-type">Type</Label>
              <Select
                value={relationshipType}
                onValueChange={setRelationshipType}
              >
                <SelectTrigger id="relationship-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {formatEnumLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="relationship-notes">Relationship context</Label>
            <Textarea
              id="relationship-notes"
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
          </div>

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

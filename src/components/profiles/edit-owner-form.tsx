"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateOwnerAction } from "@/app/(app)/profiles/[id]/actions";
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
import type { ProfileOwner } from "@/lib/data/profiles";
import { formatEnumLabel } from "@/lib/format/enum";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

const STRENGTH_OPTIONS = [
  "inner_circle",
  "strong",
  "warm",
  "weak",
  "unknown",
] as const;

type EditOwnerFormProps = {
  profileId: string;
  owner: ProfileOwner;
  onCancel: () => void;
  onSaved: () => void;
};

export function EditOwnerForm({
  profileId,
  owner,
  onCancel,
  onSaved,
}: EditOwnerFormProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [strength, setStrength] = useState<string>(owner.strength);
  const [isPrimary, setIsPrimary] = useState(owner.isPrimary);
  const [notes, setNotes] = useState(owner.notes ?? "");

  function handleCancel() {
    setStrength(owner.strength);
    setIsPrimary(owner.isPrimary);
    setNotes(owner.notes ?? "");
    onCancel();
  }

  return (
    <form
      action={(formData) => {
        void run(async () => {
          const result = await updateOwnerAction(formData);
          if (result.error) {
            await alert({ title: "Could not update owner", description: result.error });
            return;
          }
          toastSuccess("Owner updated");
          onSaved();
          router.refresh();
        });
      }}
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="ownerId" value={owner.id} />
      <input type="hidden" name="strength" value={strength} />
      {isPrimary ? <input type="hidden" name="isPrimary" value="on" /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`strength-${owner.id}`}>Strength</Label>
          <Select value={strength} onValueChange={setStrength}>
            <SelectTrigger id={`strength-${owner.id}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STRENGTH_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {formatEnumLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2 text-body text-foreground">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(event) => setIsPrimary(event.target.checked)}
              className="size-4 rounded border"
            />
            Primary owner
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`notes-${owner.id}`}>Owner notes</Label>
        <Textarea
          id={`notes-${owner.id}`}
          name="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          placeholder="Private notes for this owner"
        />
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
  );
}

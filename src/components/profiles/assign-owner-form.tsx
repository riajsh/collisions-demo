"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { assignOwnerAction } from "@/app/(app)/profiles/[id]/actions";
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
import type { OrgUser } from "@/lib/data/users";
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

type AssignOwnerFormProps = {
  profileId: string;
  teamUsers: OrgUser[];
  assignedUserIds: string[];
};

export function AssignOwnerForm({
  profileId,
  teamUsers,
  assignedUserIds,
}: AssignOwnerFormProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [isOpen, setIsOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [strength, setStrength] = useState<string>("unknown");

  const availableUsers = teamUsers.filter(
    (user) => !assignedUserIds.includes(user.id),
  );

  if (availableUsers.length === 0) {
    return (
      <p className="text-caption text-muted-foreground">
        All team members are already owners for this profile.
      </p>
    );
  }

  function handleCancel() {
    setUserId("");
    setStrength("unknown");
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
      >
        Assign owner
      </Button>
    );
  }

  return (
    <form
      action={(formData) => {
        void run(async () => {
          const result = await assignOwnerAction(formData);
          if (result.error) {
            await alert({ title: "Could not assign owner", description: result.error });
            return;
          }
          toastSuccess("Owner assigned");
          setUserId("");
          setStrength("unknown");
          setIsOpen(false);
          router.refresh();
        });
      }}
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="strength" value={strength} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="assign-user">Team member</Label>
          <Select value={userId} onValueChange={setUserId} required>
            <SelectTrigger id="assign-user" className="w-full">
              <SelectValue placeholder="Select owner" />
            </SelectTrigger>
            <SelectContent>
              {availableUsers.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="assign-strength">Strength</Label>
          <Select value={strength} onValueChange={setStrength}>
            <SelectTrigger id="assign-strength" className="w-full">
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
      </div>

      <label className="flex items-center gap-2 text-body text-foreground">
        <input type="checkbox" name="isPrimary" className="size-4 rounded border" />
        Set as primary owner
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending || !userId} size="sm">
          {isPending ? "Assigning…" : "Assign"}
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

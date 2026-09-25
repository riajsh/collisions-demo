"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateProfileStatusAction } from "@/app/(app)/profiles/[id]/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEnumLabel } from "@/lib/format/enum";
import { toastError } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";
import type { Database } from "@/types/database";

type RelationshipStatus = Database["public"]["Enums"]["relationship_status"];

const STATUS_OPTIONS: RelationshipStatus[] = [
  "prospect",
  "active",
  "partner",
  "advisor",
  "community",
  "dormant",
  "inactive",
];

type InlineStatusCellProps = {
  profileId: string;
  status: RelationshipStatus | null;
};

/**
 * Click-to-edit status, right in the table — no modal, no leaving the
 * list. Opens straight into the dropdown (rather than needing a second
 * click to open it) so it reads as "editing," not "here's a button that
 * opens something."
 */
export function InlineStatusCell({ profileId, status }: InlineStatusCellProps) {
  const router = useRouter();
  const { isPending, run } = useAsyncAction();
  const [isEditing, setIsEditing] = useState(false);
  const [localStatus, setLocalStatus] = useState(status);

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsEditing(true);
        }}
        className="rounded px-1.5 py-0.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {localStatus ? formatEnumLabel(localStatus) : "—"}
      </button>
    );
  }

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Select
        open
        value={localStatus ?? undefined}
        disabled={isPending}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditing(false);
          }
        }}
        onValueChange={(value) => {
          const next = value as RelationshipStatus;
          const previous = localStatus;
          setLocalStatus(next);
          setIsEditing(false);
          void run(async () => {
            const result = await updateProfileStatusAction(profileId, next);
            if (result.error) {
              setLocalStatus(previous);
              toastError("Could not update status", result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        <SelectTrigger size="sm" className="h-7 w-32">
          <SelectValue placeholder="Set status" />
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
  );
}

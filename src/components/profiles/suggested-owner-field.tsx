"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckIcon, PencilIcon } from "lucide-react";

import {
  assignOwnerAction,
  assignSuggestedOwnerAction,
} from "@/app/(app)/profiles/[id]/actions";
import { Badge } from "@/components/ui/badge";
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
import { OwnerDot } from "@/components/profiles/owner-dot";
import { ownerSuggestionLabel } from "@/lib/enrichment/labels";
import type { OwnerSuggestion } from "@/lib/enrichment/owner-enrichment";
import type { OrgUser } from "@/lib/data/users";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";
import { cn } from "@/lib/utils";

type SuggestedOwnerFieldProps = {
  profileId: string;
  suggestion: OwnerSuggestion;
  teamUsers: OrgUser[];
  assignedUserIds?: string[];
  variant?: "detail" | "table";
  className?: string;
};

export function SuggestedOwnerField({
  profileId,
  suggestion,
  teamUsers,
  assignedUserIds = [],
  variant = "detail",
  className,
}: SuggestedOwnerFieldProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [isEditing, setIsEditing] = useState(false);
  const [userId, setUserId] = useState(suggestion.userId);

  const availableUsers = teamUsers.filter(
    (user) => !assignedUserIds.includes(user.id) || user.id === userId,
  );

  const selectedUser =
    teamUsers.find((user) => user.id === userId) ??
    ({ fullName: suggestion.fullName, id: suggestion.userId } as OrgUser);

  function handleConfirm() {
    if (!userId) {
      return;
    }

    void run(async () => {
      const result =
        userId === suggestion.userId
          ? await assignSuggestedOwnerAction(profileId, userId)
          : await assignOwnerAction(
              (() => {
                const formData = new FormData();
                formData.set("profileId", profileId);
                formData.set("userId", userId);
                formData.set("strength", "warm");
                formData.set("isPrimary", "on");
                return formData;
              })(),
            );

      if (result.error) {
        await alert({ title: "Could not assign owner", description: result.error });
        return;
      }
      toastSuccess("Owner assigned");
      setIsEditing(false);
      router.refresh();
    });
  }

  if (isEditing) {
    return (
      <div
        className={cn("space-y-3", className)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {variant === "detail" ? (
          <p className="text-caption text-muted-foreground">Primary owner</p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor={`suggested-owner-${profileId}`} className="sr-only">
            Suggested owner
          </Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger id={`suggested-owner-${profileId}`} className="w-full">
              <SelectValue />
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
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={isPending || !userId}
            onClick={handleConfirm}
          >
            <CheckIcon className="size-3.5" aria-hidden="true" />
            {isPending ? "Assigning…" : "Confirm"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              setUserId(suggestion.userId);
              setIsEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div
        className={cn("inline-flex max-w-full items-center gap-1", className)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="inline-flex min-w-0 flex-1 items-center gap-1 rounded-md border border-dashed border-border bg-muted/20 px-2 py-1 text-left transition-colors hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setIsEditing(true)}
        >
          <OwnerDot userId={selectedUser.id} />
          <span className="truncate text-[var(--color-data-inferred)]">
            {selectedUser.fullName}
          </span>
          <PencilIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-7 shrink-0"
          disabled={isPending}
          aria-label={`Confirm owner ${selectedUser.fullName}`}
          onClick={() => handleConfirm()}
        >
          <CheckIcon className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-caption text-muted-foreground">Primary owner</p>
        <Badge variant="secondary">Suggested</Badge>
      </div>
      <button
        type="button"
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setIsEditing(true)}
      >
        <p className="inline-flex items-center gap-2 text-body font-medium text-[var(--color-data-inferred)]">
          <OwnerDot userId={selectedUser.id} />
          <span>{selectedUser.fullName}</span>
        </p>
        <p className="text-caption text-muted-foreground">
          {ownerSuggestionLabel(suggestion)} — click to edit
        </p>
      </button>
      <Button
        type="button"
        size="sm"
        disabled={isPending}
        onClick={() => handleConfirm()}
      >
        <CheckIcon className="size-3.5" aria-hidden="true" />
        {isPending ? "Assigning…" : "Confirm"}
      </Button>
    </div>
  );
}

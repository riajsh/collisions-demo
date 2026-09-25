"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  addProfileTagAction,
  removeProfileTagAction,
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
import type { OrgTag } from "@/lib/data/tags";
import { formatEnumLabel } from "@/lib/format/enum";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

type ProfileTagsSectionProps = {
  profileId: string;
  tags: Array<{ id: string; name: string; category: string }>;
  orgTags: OrgTag[];
};

export function ProfileTagsSection({
  profileId,
  tags,
  orgTags,
}: ProfileTagsSectionProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [isEditing, setIsEditing] = useState(false);
  const [tagId, setTagId] = useState("");

  const assignedTagIds = new Set(tags.map((tag) => tag.id));
  const availableTags = orgTags.filter((tag) => !assignedTagIds.has(tag.id));

  function runAction(action: (formData: FormData) => Promise<{ error?: string }>) {
    return (formData: FormData) => {
      void run(async () => {
        const result = await action(formData);
        if (result.error) {
          await alert({ title: "Could not update tags", description: result.error });
          return;
        }
        toastSuccess("Tags updated");
        setTagId("");
        router.refresh();
      });
    };
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      {!isEditing ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
          >
            Edit
          </Button>
        </div>
      ) : null}

      {!isEditing ? (
        tags.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li key={tag.id}>
                <Badge variant="secondary">{tag.name}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-muted-foreground">No tags assigned yet.</p>
        )
      ) : (
        <div className="space-y-4">
          {tags.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <li key={tag.id}>
                  <form
                    action={runAction(removeProfileTagAction)}
                    className="inline"
                  >
                    <input type="hidden" name="profileId" value={profileId} />
                    <input type="hidden" name="tagId" value={tag.id} />
                    <Button
                      type="submit"
                      variant="secondary"
                      size="sm"
                      disabled={isPending}
                      className="h-auto gap-1.5 py-1 font-normal"
                    >
                      {tag.name}
                      <span aria-hidden="true">×</span>
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-muted-foreground">
              No tags assigned yet.
            </p>
          )}

          {availableTags.length > 0 ? (
            <form
              action={runAction(addProfileTagAction)}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <input type="hidden" name="profileId" value={profileId} />
              <input type="hidden" name="tagId" value={tagId} />
              <div className="min-w-48 flex-1 space-y-2">
                <Label htmlFor="add-profile-tag">Add tag</Label>
                <Select value={tagId} onValueChange={setTagId} required>
                  <SelectTrigger id="add-profile-tag" className="w-full">
                    <SelectValue placeholder="Select tag" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTags.map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>
                        {tag.name} ({formatEnumLabel(tag.category)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                disabled={isPending || !tagId}
                className="w-fit"
              >
                {isPending ? "Adding…" : "Add tag"}
              </Button>
            </form>
          ) : tags.length === orgTags.length && orgTags.length > 0 ? (
            <p className="text-caption text-muted-foreground">
              All of your team&apos;s tags are already assigned.
            </p>
          ) : orgTags.length === 0 ? (
            <p className="text-caption text-muted-foreground">
              No tags yet. Admins can create tags under Admin → Tags.
            </p>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setTagId("");
              setIsEditing(false);
            }}
          >
            Done
          </Button>
        </div>
      )}
    </div>
  );
}

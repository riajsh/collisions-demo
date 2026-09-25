"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createTagAction } from "@/app/(app)/admin/tags/actions";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEnumLabel } from "@/lib/format/enum";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

const TAG_CATEGORIES = [
  "expertise",
  "industry",
  "signal_influence",
  "events",
  "seniority",
  "function",
] as const;

export function CreateTagForm() {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [category, setCategory] = useState<string>("expertise");

  return (
    <form
      action={(formData) => {
        void run(async () => {
          const result = await createTagAction(formData);
          if (result.error) {
            await alert({ title: "Could not create tag", description: result.error });
            return;
          }
          toastSuccess("Tag created");
          router.refresh();
        });
      }}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-end"
    >
      <input type="hidden" name="category" value={category} />
      <div className="min-w-48 flex-1 space-y-2">
        <Label htmlFor="tag-name">Tag name</Label>
        <Input id="tag-name" name="name" required placeholder="e.g. Climate" />
      </div>
      <div className="min-w-40 space-y-2">
        <Label htmlFor="tag-category">Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="tag-category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAG_CATEGORIES.map((option) => (
              <SelectItem key={option} value={option}>
                {formatEnumLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Creating…" : "Create tag"}
      </Button>
    </form>
  );
}

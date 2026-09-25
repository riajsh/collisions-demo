"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteTagAction } from "@/app/(app)/admin/tags/actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { useAsyncAction } from "@/lib/use-async-action";
import { toastSuccess } from "@/lib/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { OrgTag } from "@/lib/data/tags";
import { formatEnumLabel } from "@/lib/format/enum";

type TagsTableProps = {
  tags: OrgTag[];
};

function DeleteTagButton({ tag }: { tag: OrgTag }) {
  const router = useRouter();
  const { confirm, alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [isConfirming, setIsConfirming] = useState(false);

  async function handleDelete() {
    setIsConfirming(true);
    try {
      const confirmed = await confirm({
        title: "Delete tag",
        description: `Delete tag "${tag.name}"? It will be removed from all profiles.`,
        confirmLabel: "Delete",
        destructive: true,
      });

      if (!confirmed) {
        return;
      }

      await run(async () => {
        const formData = new FormData();
        formData.set("tagId", tag.id);
        const result = await deleteTagAction(formData);
        if (result.error) {
          await alert({ title: "Could not delete tag", description: result.error });
          return;
        }
        toastSuccess("Tag deleted");
        router.refresh();
      });
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending || isConfirming}
      className="text-destructive hover:text-destructive"
      onClick={handleDelete}
    >
      Delete
    </Button>
  );
}

export function TagsTable({ tags }: TagsTableProps) {
  if (tags.length === 0) {
    return (
      <EmptyState
        title="No tags yet"
        description="Create Expertise, Industry, and Signal/Influence tags to classify profiles."
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Profiles</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tags.map((tag) => (
            <TableRow key={tag.id}>
              <TableCell className="font-medium text-foreground">{tag.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatEnumLabel(tag.category)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {tag.profileCount}
              </TableCell>
              <TableCell>
                <DeleteTagButton tag={tag} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

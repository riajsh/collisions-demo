"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { cancelImportAction } from "@/app/(app)/profiles/import/actions";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { toastSuccess } from "@/lib/toast";

type ImportDeleteButtonProps = {
  importId: string;
  filename: string;
  hasCommitProgress?: boolean;
};

export function ImportDeleteButton({
  importId,
  filename,
  hasCommitProgress = false,
}: ImportDeleteButtonProps) {
  const router = useRouter();
  const { confirm, alert } = useAppDialog();
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  async function handleCancel() {
    const confirmed = await confirm({
      title: "Cancel this import?",
      description: hasCommitProgress
        ? `Cancel "${filename}"? Any profiles or updates it's already made will be undone, then it'll be removed. This can't be undone.`
        : `Cancel "${filename}"? Nothing has been added to your profiles yet, so this just removes the upload. This can't be undone.`,
      confirmLabel: "Cancel import",
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    setError(null);
    setIsCancelling(true);

    const formData = new FormData();
    formData.set("importId", importId);

    try {
      const result = await cancelImportAction(formData);
      if (result?.error) {
        setError(result.error);
        await alert({ title: "Could not cancel import", description: result.error });
        return;
      }

      toastSuccess("Import cancelled");
      router.push("/profiles/import");
      router.refresh();
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isCancelling}
        onClick={handleCancel}
      >
        {isCancelling ? "Cancelling…" : "Cancel import"}
      </Button>
      {error ? (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

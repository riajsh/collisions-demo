"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { backfillImportProfilesAction } from "@/app/(app)/profiles/import/actions";
import { Button } from "@/components/ui/button";

type ImportProfileBackfillButtonProps = {
  importId: string;
  previousSummary?: {
    profilesUpdated: number;
    relationshipsUpdated: number;
    ownersAssigned: number;
    ownersUnresolved: number;
    tagsLinked: number;
    skipped: number;
  } | null;
};

export function ImportProfileBackfillButton({
  importId,
  previousSummary,
}: ImportProfileBackfillButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState(previousSummary);
  const [isRunning, setIsRunning] = useState(false);

  async function handleBackfill() {
    setError(null);
    setIsRunning(true);

    const formData = new FormData();
    formData.set("importId", importId);

    try {
      const result = await backfillImportProfilesAction(formData);

      if (result?.error) {
        setError(result.error);
        return;
      }

      if (result?.summary) {
        setSummary(result.summary);
        router.refresh();
      }
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <p className="text-body text-muted-foreground">
        Apply missing profile fields from the CSV — occupation, location, LinkedIn,
        owners, strength, relationship type, industry tags, and any extra details.
        Only fills empty profile fields; does not overwrite what&apos;s already there.
      </p>

      <Button
        type="button"
        variant="outline"
        disabled={isRunning}
        onClick={handleBackfill}
      >
        {isRunning ? "Applying import data…" : "Apply import data to profiles"}
      </Button>

      {isRunning ? (
        <p className="text-caption text-muted-foreground">
          This may take up to a minute for large imports.
        </p>
      ) : null}

      {summary ? (
        <p className="text-caption text-muted-foreground">
          {summary.profilesUpdated} profiles updated · {summary.ownersAssigned}{" "}
          owners assigned · {summary.relationshipsUpdated} relationships updated ·{" "}
          {summary.tagsLinked} tags linked · {summary.ownersUnresolved} owners
          unresolved
          {summary.skipped > 0 ? ` · ${summary.skipped} skipped` : ""}
        </p>
      ) : null}

      {summary &&
      summary.profilesUpdated === 0 &&
      summary.ownersAssigned === 0 &&
      summary.relationshipsUpdated === 0 &&
      summary.tagsLinked === 0 ? (
        <p className="text-body text-amber-700 dark:text-amber-400" role="status">
          No profile fields were updated. If you expected changes, check that the CSV
          columns are mapped (Role / Title, Relationship Owner, City, etc.) and click
          again — the latest run re-reads raw CSV data using auto-detected columns.
        </p>
      ) : null}

      {error ? (
        <p className="text-body text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

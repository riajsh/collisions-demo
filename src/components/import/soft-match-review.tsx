"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { resolveSoftMatchAction } from "@/app/(app)/profiles/import/actions";
import type { ImportRowView, SoftMatchAction } from "@/lib/import/types";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { cn } from "@/lib/utils";

type SoftMatchReviewProps = {
  importId: string;
  rows: ImportRowView[];
};

const ACTION_LABELS: Record<SoftMatchAction, string> = {
  confirm: "Merge into existing",
  create: "Create as new",
  replace: "Delete & replace",
  skip: "Skip row",
};

export function SoftMatchReview({ importId, rows }: SoftMatchReviewProps) {
  const router = useRouter();
  const { confirm } = useAppDialog();
  const [error, setError] = useState<string | null>(null);
  const [resolvingRowId, setResolvingRowId] = useState<string | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      rows.map((row) => [
        row.id,
        row.matchedProfileId ?? row.matchedProfileCandidates[0]?.id ?? "",
      ]),
    ),
  );

  async function handleAction(row: ImportRowView, action: SoftMatchAction) {
    if (resolvingRowId) {
      return;
    }

    const candidateId = selectedCandidates[row.id] ?? "";

    if (action === "replace") {
      const candidateName =
        row.matchedProfileCandidates.find((candidate) => candidate.id === candidateId)
          ?.fullName ?? row.matchedProfileName;

      const confirmed = await confirm({
        title: "Delete & replace this profile?",
        description: `This permanently deletes ${candidateName ?? "the existing profile"} and creates a brand new profile from this row's data instead. This can't be undone.`,
        confirmLabel: "Delete & replace",
        destructive: true,
      });

      if (!confirmed) {
        return;
      }
    }

    setResolvingRowId(row.id);
    setError(null);

    const formData = new FormData();
    formData.set("importId", importId);
    formData.set("rowId", row.id);
    formData.set("action", action);
    if ((action === "confirm" || action === "replace") && candidateId) {
      formData.set("matchedProfileId", candidateId);
    }

    try {
      const result = await resolveSoftMatchAction(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }

      router.refresh();
    } finally {
      setResolvingRowId(null);
    }
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div>
        <h2 className="text-heading font-medium text-foreground">
          Needs your review
        </h2>
        <p className="mt-1 text-body text-muted-foreground">
          These rows may match existing people by email, phone, LinkedIn, or
          similar name and company. Choose what to do with each — nothing here
          is written until you complete the import.
        </p>
      </div>

      <div className="space-y-4">
        {rows.map((row) => {
          const selectedCandidateId = selectedCandidates[row.id] ?? "";
          const hasMultipleCandidates = row.matchedProfileCandidates.length > 1;
          const isResolving = resolvingRowId === row.id;

          return (
            <div
              key={row.id}
              className="grid gap-4 rounded-md border border-border p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <div>
                <p className="text-caption text-muted-foreground">Incoming</p>
                <p className="text-body font-medium">{row.normalized.full_name}</p>
                <p className="text-body text-muted-foreground">
                  {row.normalized.organisation_name ?? "No company"}
                </p>
                <p className="text-caption text-muted-foreground">
                  {row.normalized.email ?? "No email"}
                </p>
                {row.normalized.phone ? (
                  <p className="text-caption text-muted-foreground">
                    {row.normalized.phone}
                  </p>
                ) : null}
                {row.normalized.linkedin_url ? (
                  <p className="text-caption text-muted-foreground">
                    {row.normalized.linkedin_url}
                  </p>
                ) : null}
              </div>

              <div>
                <p className="text-caption text-muted-foreground">
                  {hasMultipleCandidates ? "Choose candidate" : "Candidate"}
                </p>
                {row.matchedProfileCandidates.length > 0 ? (
                  <fieldset className="mt-2 space-y-2">
                    {row.matchedProfileCandidates.map((candidate) => {
                      const isSelected = selectedCandidateId === candidate.id;

                      return (
                        <label
                          key={candidate.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2",
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border",
                          )}
                        >
                          <input
                            type="radio"
                            name={`candidate-${row.id}`}
                            className="mt-1"
                            checked={isSelected}
                            disabled={resolvingRowId !== null}
                            onChange={() => {
                              setSelectedCandidates((current) => ({
                                ...current,
                                [row.id]: candidate.id,
                              }));
                            }}
                          />
                          <span>
                            <span className="block text-body font-medium text-foreground">
                              {candidate.fullName}
                            </span>
                            <span className="block text-caption text-muted-foreground">
                              {candidate.organisationName ?? "No company"}
                            </span>
                            <span className="block text-caption text-muted-foreground">
                              {candidate.email ?? "No email"}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </fieldset>
                ) : row.matchedInFileRowNumber ? (
                  <>
                    <p className="text-body font-medium">{row.matchedProfileName}</p>
                    <p className="text-body text-muted-foreground">
                      {row.matchedProfileCompany ?? "No company"}
                    </p>
                    <p className="text-caption text-muted-foreground">
                      Row {row.matchedInFileRowNumber} in this file
                      {row.matchedInFileRowEmail
                        ? ` · ${row.matchedInFileRowEmail}`
                        : " · no email"}
                    </p>
                  </>
                ) : (
                  <p className="text-body text-muted-foreground">No candidate loaded</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 lg:flex-col lg:justify-center">
                {(["confirm", "create", "replace", "skip"] as const).map(
                  (action) => (
                    <Button
                      key={action}
                      type="button"
                      size="sm"
                      disabled={
                        resolvingRowId !== null ||
                        ((action === "confirm" || action === "replace") &&
                          row.matchedProfileCandidates.length > 0 &&
                          !selectedCandidateId)
                      }
                      variant={
                        action === "confirm"
                          ? "default"
                          : action === "replace"
                            ? "destructive"
                            : "outline"
                      }
                      onClick={() => handleAction(row, action)}
                    >
                      {isResolving ? "Working…" : ACTION_LABELS[action]}
                    </Button>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="text-body text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

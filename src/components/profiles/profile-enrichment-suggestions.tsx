"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  acceptSuggestedCompanyAction,
  assignSuggestedOwnerAction,
} from "@/app/(app)/profiles/[id]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import {
  companySuggestionLabel,
  ownerSuggestionLabel,
} from "@/lib/enrichment/labels";
import type { ProfileEnrichmentSuggestions } from "@/lib/enrichment/profile-enrichment";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

type ProfileEnrichmentSuggestionsProps = {
  profileId: string;
  suggestions: ProfileEnrichmentSuggestions;
};

export function ProfileEnrichmentSuggestions({
  profileId,
  suggestions,
}: ProfileEnrichmentSuggestionsProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [error, setError] = useState<string | null>(null);

  if (!suggestions.company && !suggestions.owner) {
    return null;
  }

  function runSuggestion(
    action: () => Promise<{ error?: string }>,
    successMessage: string,
  ) {
    void run(async () => {
      setError(null);
      const result = await action();
      if (result.error) {
        setError(result.error);
        await alert({ title: "Could not apply suggestion", description: result.error });
        return;
      }
      toastSuccess(successMessage);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-subheading font-medium text-foreground">
          Suggested from calendar data
        </p>
        <Badge variant="secondary">Suggested</Badge>
      </div>

      <div className="space-y-3">
        {suggestions.company ? (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-3">
            <div className="space-y-1">
              <p className="text-body font-medium text-foreground">
                Company: {suggestions.company.name}
              </p>
              <p className="text-caption text-muted-foreground">
                {companySuggestionLabel(suggestions.company)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                runSuggestion(
                  () =>
                    acceptSuggestedCompanyAction(
                      profileId,
                      suggestions.company!.name,
                    ),
                  "Company applied",
                );
              }}
            >
              Use company
            </Button>
          </div>
        ) : null}

        {suggestions.owner ? (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-3">
            <div className="space-y-1">
              <p className="text-body font-medium text-foreground">
                Primary owner: {suggestions.owner.fullName}
              </p>
              <p className="text-caption text-muted-foreground">
                {ownerSuggestionLabel(suggestions.owner)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                runSuggestion(
                  () =>
                    assignSuggestedOwnerAction(
                      profileId,
                      suggestions.owner!.userId,
                    ),
                  "Owner assigned",
                );
              }}
            >
              Assign owner
            </Button>
          </div>
        ) : null}
      </div>
      {error ? (
        <p className="text-body text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";

import { generateProfileSummaryAction } from "@/app/(app)/profiles/[id]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { formatInteractionDate } from "@/lib/format/date";
import { useAsyncAction } from "@/lib/use-async-action";

type ProfileSummaryHeroProps = {
  profileId: string;
  summary: string | null;
  generatedAt: string | null;
  /** Notes + logged interactions + events, as of last generation. */
  summarySignalCount: number | null;
  /** Same count, right now — the gap between the two drives the "N updates
   * since last summary" badge. */
  currentSignalCount: number;
};

/**
 * The single "where things stand" summary for a profile — role, bio, our
 * own relationship notes, logged interactions, and self-reported event
 * notes all synthesised together. This replaced the old Notes section's own
 * local TL;DR: rather than two separate summaries competing for attention,
 * this is now the one consolidated read, shown near the top of the profile.
 */
export function ProfileSummaryHero({
  profileId,
  summary,
  generatedAt,
  summarySignalCount,
  currentSignalCount,
}: ProfileSummaryHeroProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();

  const hasSummary = Boolean(summary);
  const newSinceSummary = currentSignalCount - (summarySignalCount ?? 0);

  if (!hasSummary && currentSignalCount === 0) {
    return null;
  }

  function handleGenerate() {
    void run(async () => {
      const result = await generateProfileSummaryAction(profileId);
      if (result.error) {
        await alert({
          title: "Could not generate summary",
          description: result.error,
        });
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Where things stand</Badge>
          {generatedAt ? (
            <span className="text-caption text-muted-foreground">
              Generated {formatInteractionDate(generatedAt)}
            </span>
          ) : null}
          {newSinceSummary > 0 ? (
            <Badge variant="outline">
              {newSinceSummary} update{newSinceSummary === 1 ? "" : "s"} since
              last summary
            </Badge>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={handleGenerate}
        >
          {isPending ? "Summarizing…" : hasSummary ? "Regenerate" : "Summarize"}
        </Button>
      </div>

      {summary ? (
        <p className="text-body text-foreground">{summary}</p>
      ) : (
        <p className="text-body text-muted-foreground">
          Not summarised yet — generate a quick read on where things stand
          with this person.
        </p>
      )}
    </section>
  );
}

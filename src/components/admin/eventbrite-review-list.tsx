"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  bulkCreateProfilesFromReviewsAction,
  bulkIgnoreReviewsAction,
} from "@/app/(app)/admin/eventbrite/actions";
import { EventbriteReviewRow } from "@/components/admin/eventbrite-review-row";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { EventbriteReviewRow as EventbriteReviewRowData } from "@/lib/data/eventbrite-reviews";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

type RowState = {
  fullName: string;
  email: string;
  role: string;
  organisationName: string;
  selected: boolean;
};
type BatchError = { reviewId: string; message: string };

// Kept small on purpose: each batch is one server round-trip that resolves
// every review in it (profile create/reuse + attendee + tag + status
// update, or just an ignore). Doing all of them at once in a single request
// risked the serverless function's own time limit — the request would get
// killed mid-way with no result ever coming back, leaving the button stuck
// on "Creating…" forever even though most of the work had actually gone
// through. Small batches finish comfortably inside that limit and let us
// show real progress between them.
const BULK_BATCH_SIZE = 10;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs a bulk review action (create or ignore) in small batches, retrying
 * each batch once on failure, and reporting progress after every batch so
 * the UI never looks stuck even though the whole thing might take a while.
 */
async function runInBatches<T extends { reviewId: string }>(
  items: T[],
  setProgress: (updater: (current: { done: number; total: number } | null) => { done: number; total: number } | null) => void,
  callBatch: (batch: T[], isFinalBatch: boolean) => Promise<{ errors: BatchError[] }>,
): Promise<{ errors: BatchError[] }> {
  const batches = chunk(items, BULK_BATCH_SIZE);
  const allErrors: BatchError[] = [];

  setProgress(() => ({ done: 0, total: items.length }));

  for (const [batchIndex, batch] of batches.entries()) {
    const isFinalBatch = batchIndex === batches.length - 1;
    let succeeded = false;
    let lastError: unknown = null;

    // One retry per batch — covers a single flaky request without holding
    // up everything else if a batch is genuinely broken.
    for (let attempt = 0; attempt < 2 && !succeeded; attempt += 1) {
      try {
        const result = await callBatch(batch, isFinalBatch);
        allErrors.push(...result.errors);
        succeeded = true;
      } catch (batchError) {
        lastError = batchError;
        if (attempt === 0) {
          await sleep(1000);
        }
      }
    }

    if (!succeeded) {
      allErrors.push(
        ...batch.map((entry) => ({
          reviewId: entry.reviewId,
          message: lastError instanceof Error ? lastError.message : "Action failed",
        })),
      );
    }

    setProgress((current) => (current ? { ...current, done: current.done + batch.length } : current));

    // Brief pause between requests so we're not hammering the server
    // back-to-back — mirrors the same small delay used elsewhere for bulk
    // operations (CSV import commit bursts).
    await sleep(150);
  }

  setProgress(() => null);
  return { errors: allErrors };
}

export function EventbriteReviewList({
  reviews,
}: {
  reviews: EventbriteReviewRowData[];
}) {
  const router = useRouter();
  const { isPending, run } = useAsyncAction();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [activeAction, setActiveAction] = useState<"create" | "ignore" | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      reviews.map((review) => [
        review.id,
        {
          fullName: review.displayName ?? "",
          email: review.email,
          role: review.suggestedRole ?? "",
          organisationName: review.suggestedOrganisationName ?? "",
          selected: false,
        },
      ]),
    ),
  );

  const selectedIds = useMemo(
    () => reviews.filter((review) => (rowState[review.id]?.selected ?? false)).map((review) => review.id),
    [reviews, rowState],
  );
  const allSelected = reviews.length > 0 && selectedIds.length === reviews.length;

  function toggleAll(value: boolean) {
    setRowState((current) =>
      Object.fromEntries(
        reviews.map((review) => [
          review.id,
          { ...(current[review.id] ?? defaultRowFor(review.id)), selected: value },
        ]),
      ),
    );
  }

  function updateRow(id: string, patch: Partial<RowState>) {
    setRowState((current) => ({
      ...current,
      [id]: { ...defaultRowFor(id), ...current[id], ...patch },
    }));
  }

  function defaultRowFor(id: string): RowState {
    const review = reviews.find((entry) => entry.id === id);
    return {
      fullName: review?.displayName ?? "",
      email: review?.email ?? "",
      role: review?.suggestedRole ?? "",
      organisationName: review?.suggestedOrganisationName ?? "",
      selected: false,
    };
  }

  function rowFor(id: string): RowState {
    return rowState[id] ?? defaultRowFor(id);
  }

  function handleBulkCreate() {
    if (selectedIds.length === 0) {
      return;
    }
    setActiveAction("create");
    void run(async () => {
      setError(null);
      const items = selectedIds.map((reviewId) => ({
        reviewId,
        fullName: rowFor(reviewId).fullName,
        email: rowFor(reviewId).email,
        role: rowFor(reviewId).role || undefined,
        organisationName: rowFor(reviewId).organisationName || undefined,
      }));

      let createdTotal = 0;
      const { errors } = await runInBatches(items, setProgress, async (batch, isFinalBatch) => {
        const result = await bulkCreateProfilesFromReviewsAction(batch, isFinalBatch);
        createdTotal += result.createdCount;
        return { errors: result.errors };
      });

      if (createdTotal > 0) {
        toastSuccess(`Created ${createdTotal} profile${createdTotal === 1 ? "" : "s"}`);
      }
      if (errors.length > 0) {
        setError(
          `${errors.length} couldn't be created: ${errors.map((entry) => entry.message).join("; ")}`,
        );
      }
      router.refresh();
    });
  }

  function handleBulkIgnore() {
    if (selectedIds.length === 0) {
      return;
    }
    setActiveAction("ignore");
    void run(async () => {
      setError(null);

      let ignoredTotal = 0;
      const items = selectedIds.map((reviewId) => ({ reviewId }));
      const { errors } = await runInBatches(items, setProgress, async (batch, isFinalBatch) => {
        const result = await bulkIgnoreReviewsAction(
          batch.map((entry) => entry.reviewId),
          isFinalBatch,
        );
        ignoredTotal += result.ignoredCount;
        return { errors: result.errors };
      });

      if (ignoredTotal > 0) {
        toastSuccess(`Ignored ${ignoredTotal} attendee${ignoredTotal === 1 ? "" : "s"}`);
      }
      if (errors.length > 0) {
        setError(
          `${errors.length} couldn't be ignored: ${errors.map((entry) => entry.message).join("; ")}`,
        );
      }
      router.refresh();
    });
  }

  if (reviews.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <label className="flex items-center gap-2 text-body text-foreground">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(value) => toggleAll(value === true)}
            aria-label="Select all"
          />
          Select all
        </label>
        <Button
          type="button"
          size="sm"
          disabled={selectedIds.length === 0 || isPending}
          onClick={handleBulkCreate}
        >
          {isPending && activeAction === "create" && progress
            ? `Creating ${progress.done} of ${progress.total}…`
            : `Create ${selectedIds.length > 0 ? `${selectedIds.length} ` : ""}new profile${
                selectedIds.length === 1 ? "" : "s"
              }`}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={selectedIds.length === 0 || isPending}
          onClick={handleBulkIgnore}
        >
          {isPending && activeAction === "ignore" && progress
            ? `Ignoring ${progress.done} of ${progress.total}…`
            : `Ignore ${selectedIds.length > 0 ? `${selectedIds.length} ` : ""}selected`}
        </Button>
      </div>

      {progress ? (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%`,
              }}
            />
          </div>
          <p className="text-caption text-muted-foreground">
            {Math.round((progress.done / Math.max(progress.total, 1)) * 100)}% complete —{" "}
            {progress.done} of {progress.total}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        {reviews.map((review) => (
          <EventbriteReviewRow
            key={review.id}
            review={review}
            fullName={rowFor(review.id).fullName}
            email={rowFor(review.id).email}
            role={rowFor(review.id).role}
            organisationName={rowFor(review.id).organisationName}
            onFullNameChange={(value) => updateRow(review.id, { fullName: value })}
            onEmailChange={(value) => updateRow(review.id, { email: value })}
            onRoleChange={(value) => updateRow(review.id, { role: value })}
            onOrganisationNameChange={(value) => updateRow(review.id, { organisationName: value })}
            selected={rowFor(review.id).selected}
            onToggleSelected={(value) => updateRow(review.id, { selected: value })}
          />
        ))}
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";

import { resolveProfileUpdateReviewAction } from "@/app/(app)/admin/eventbrite/actions";
import { Button } from "@/components/ui/button";
import type { ProfileUpdateReviewRow as ProfileUpdateReviewRowData } from "@/lib/data/eventbrite-profile-updates";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

export function EventbriteProfileUpdateRow({
  review,
}: {
  review: ProfileUpdateReviewRowData;
}) {
  const router = useRouter();
  const { isPending, run } = useAsyncAction();

  function submit(action: "apply" | "ignore") {
    void run(async () => {
      const formData = new FormData();
      formData.set("reviewId", review.id);
      formData.set("action", action);
      const result = await resolveProfileUpdateReviewAction(formData);
      if (result.error) {
        return;
      }
      toastSuccess(action === "apply" ? "Profile updated" : "Left as-is");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <p className="font-medium text-foreground">{review.profileName}</p>
        <p className="text-caption text-muted-foreground">
          New info from {review.eventTitle}
        </p>
      </div>

      <div className="space-y-2">
        {review.changes.map((change) => (
          <div key={change.field} className="grid grid-cols-[auto_1fr_1fr] items-center gap-3 text-body">
            <span className="text-caption text-muted-foreground">{change.label}</span>
            <span className="text-muted-foreground line-through">{change.oldValue}</span>
            <span className="font-medium text-foreground">{change.newValue}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={isPending} onClick={() => submit("apply")}>
          Update profile
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={() => submit("ignore")}
        >
          Keep existing info
        </Button>
      </div>
    </div>
  );
}

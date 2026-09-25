"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteEventAction } from "@/app/(app)/events/actions";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { useAsyncAction } from "@/lib/use-async-action";
import { toastSuccess } from "@/lib/toast";

type DeleteEventButtonProps = {
  eventId: string;
  eventTitle: string;
};

export function DeleteEventButton({
  eventId,
  eventTitle,
}: DeleteEventButtonProps) {
  const router = useRouter();
  const { confirm, alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [isConfirming, setIsConfirming] = useState(false);

  async function handleDelete() {
    setIsConfirming(true);
    try {
      const confirmed = await confirm({
        title: "Delete event",
        description: `Delete "${eventTitle}"? Attendees and linked timeline entries will be removed.`,
        confirmLabel: "Delete",
        destructive: true,
      });

      if (!confirmed) {
        return;
      }

      await run(async () => {
        const formData = new FormData();
        formData.set("eventId", eventId);
        const result = await deleteEventAction(formData);
        if (result.error) {
          await alert({ title: "Could not delete event", description: result.error });
          return;
        }
        toastSuccess("Event deleted");
        router.push("/events");
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
      {isPending ? "Deleting…" : "Delete event"}
    </Button>
  );
}

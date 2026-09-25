"use client";

import { useState } from "react";

import { disconnectCalendarAccountAction } from "@/app/(app)/admin/integrations/actions";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/lib/use-async-action";

type CalendarAccountRowProps = {
  accountId: string;
  email: string;
  userName: string | null;
  syncStatus: string;
  backfillPending: boolean;
  lastSyncError: string | null;
  syncEnabled: boolean;
  isCurrentUser: boolean;
};

export function CalendarAccountRow({
  accountId,
  email,
  userName,
  syncStatus,
  backfillPending,
  lastSyncError,
  syncEnabled,
  isCurrentUser,
}: CalendarAccountRowProps) {
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
      <div>
        <p className="text-body font-medium text-foreground">{email}</p>
        <p className="text-caption text-muted-foreground">
          {userName ? `Connected by ${userName}` : "Unknown user"} · {syncStatus}
          {backfillPending ? " · not loaded yet" : ""}
          {!syncEnabled ? " · disconnected" : ""}
        </p>
        {lastSyncError ? (
          <p className="mt-1 text-caption text-destructive" role="alert">
            {lastSyncError}
          </p>
        ) : null}
        {error ? (
          <p className="mt-1 text-caption text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {isCurrentUser && syncEnabled ? (
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => {
            void run(async () => {
              setError(null);
              const result = await disconnectCalendarAccountAction(accountId);
              if (result.error) {
                setError(result.error);
                await alert({
                  title: "Could not disconnect",
                  description: result.error,
                });
              }
            });
          }}
        >
          {isPending ? "Disconnecting…" : "Disconnect"}
        </Button>
      ) : null}
    </div>
  );
}

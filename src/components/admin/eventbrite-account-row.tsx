"use client";

import { useState } from "react";

import { disconnectEventbriteAccountAction } from "@/app/(app)/admin/integrations/actions";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/lib/use-async-action";

type EventbriteAccountRowProps = {
  accountName: string | null;
  accountEmail: string | null;
  connectedByName: string | null;
  syncStatus: string;
  lastSyncError: string | null;
};

export function EventbriteAccountRow({
  accountName,
  accountEmail,
  connectedByName,
  syncStatus,
  lastSyncError,
}: EventbriteAccountRowProps) {
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
      <div>
        <p className="text-body font-medium text-foreground">
          {accountName ?? accountEmail ?? "Connected Eventbrite account"}
        </p>
        <p className="text-caption text-muted-foreground">
          {accountEmail ? `${accountEmail} · ` : ""}
          {connectedByName ? `Connected by ${connectedByName}` : "Connected"}
          {" · "}
          {syncStatus}
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
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          void run(async () => {
            setError(null);
            const result = await disconnectEventbriteAccountAction();
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
    </div>
  );
}

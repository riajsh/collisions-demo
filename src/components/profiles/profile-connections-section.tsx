"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  removeConnectionAction,
  searchProfilesForPickerAction,
} from "@/app/(app)/profiles/[id]/actions";
import { AddConnectionForm } from "@/components/profiles/add-connection-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { useAsyncAction } from "@/lib/use-async-action";
import { toastSuccess } from "@/lib/toast";
import { formatEnumLabel } from "@/lib/format/enum";
import type { ProfileConnection } from "@/lib/data/profiles";
import type { OrgUser } from "@/lib/data/users";
import { cn } from "@/lib/utils";

type ProfileConnectionsSectionProps = {
  profileId: string;
  connections: ProfileConnection[];
  teamUsers: OrgUser[];
  currentUserId: string;
};

function isInferredConnection(source: string): boolean {
  return source.startsWith("inferred_");
}

function RemoveConnectionButton({
  profileId,
  connection,
}: {
  profileId: string;
  connection: ProfileConnection;
}) {
  const router = useRouter();
  const { confirm, alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [isConfirming, setIsConfirming] = useState(false);

  async function handleRemove() {
    setIsConfirming(true);
    try {
      const confirmed = await confirm({
        title: "Remove connection",
        description: `Remove connection to ${connection.otherFullName}?`,
        confirmLabel: "Remove",
        destructive: true,
      });

      if (!confirmed) {
        return;
      }

      await run(async () => {
        const formData = new FormData();
        formData.set("profileId", profileId);
        formData.set("connectionId", connection.id);
        const result = await removeConnectionAction(formData);
        if (result.error) {
          await alert({ title: "Could not remove connection", description: result.error });
          return;
        }
        toastSuccess("Connection removed");
        router.refresh();
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
      onClick={handleRemove}
    >
      Remove
    </Button>
  );
}

export function ProfileConnectionsSection({
  profileId,
  connections,
  teamUsers,
  currentUserId,
}: ProfileConnectionsSectionProps) {
  const excludedProfileIds = [
    profileId,
    ...connections.map((connection) => connection.otherProfileId),
  ];

  return (
    <div className="space-y-6">
      <AddConnectionForm
        profileId={profileId}
        excludedProfileIds={excludedProfileIds}
        teamUsers={teamUsers}
        currentUserId={currentUserId}
        onSearch={searchProfilesForPickerAction}
      />

      {connections.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="No connections recorded"
          description="Connections you've added and ones we've found automatically appear here."
        />
      ) : (
        <ul className="space-y-3">
          {connections.map((connection) => {
            const inferred = isInferredConnection(connection.source);
            const canRemove = connection.source === "manual";

            return (
              <li
                key={connection.id}
                className={cn(
                  "rounded-lg bg-card px-4 py-3",
                  inferred
                    ? "border-2 border-dashed border-border text-[var(--color-data-inferred)]"
                    : "border border-border text-foreground",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/profiles/${connection.otherProfileId}`}
                      className="text-body font-medium hover:underline"
                    >
                      {connection.otherFullName}
                    </Link>
                    <Badge variant="outline">
                      {formatEnumLabel(connection.connectionType)}
                    </Badge>
                    <Badge variant="secondary">
                      {formatEnumLabel(connection.strength)}
                    </Badge>
                    {inferred ? (
                      <Badge variant="secondary">Automatic</Badge>
                    ) : null}
                  </div>

                  {canRemove ? (
                    <RemoveConnectionButton
                      profileId={profileId}
                      connection={connection}
                    />
                  ) : null}
                </div>
                {connection.notes ? (
                  <p className="mt-2 text-body text-muted-foreground">
                    {connection.notes}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

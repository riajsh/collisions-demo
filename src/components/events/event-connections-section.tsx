import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatEnumLabel } from "@/lib/format/enum";
import type { EventConnection } from "@/lib/data/connections";
import { cn } from "@/lib/utils";

type EventConnectionsSectionProps = {
  connections: EventConnection[];
};

function isInferredConnection(source: string): boolean {
  return source.startsWith("inferred_");
}

export function EventConnectionsSection({
  connections,
}: EventConnectionsSectionProps) {
  if (connections.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
        <p className="text-subheading font-medium text-foreground">
          No connections from this event yet
        </p>
        <p className="mt-2 text-body text-muted-foreground">
          Once there are two or more attendees, use &ldquo;Find people who
          met here&rdquo; — pairs who shared the room will show up here
          automatically.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {connections.map((connection) => {
        const inferred = isInferredConnection(connection.source);

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
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/profiles/${connection.profileAId}`}
                className="font-medium hover:underline"
              >
                {connection.profileAName}
              </Link>
              <span aria-hidden="true">↔</span>
              <Link
                href={`/profiles/${connection.profileBId}`}
                className="font-medium hover:underline"
              >
                {connection.profileBName}
              </Link>
              <Badge variant="outline">
                {formatEnumLabel(connection.connectionType)}
              </Badge>
              {inferred ? (
                <Badge variant="secondary">Automatic</Badge>
              ) : (
                <Badge variant="secondary">{formatEnumLabel(connection.source)}</Badge>
              )}
            </div>
            {connection.notes ? (
              <p className="mt-2 text-caption text-muted-foreground">
                {connection.notes}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

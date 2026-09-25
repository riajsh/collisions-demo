import Link from "next/link";

import { formatInteractionDate } from "@/lib/format/date";
import { ImportStatusBadge } from "@/components/import/import-status-badge";
import type { ImportListItem } from "@/lib/import/types";

type DatasetCardsProps = {
  imports: ImportListItem[];
};

function stat(label: string, value: number) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-center">
      <p className="text-subheading font-medium text-foreground">{value}</p>
      <p className="text-caption text-muted-foreground">{label}</p>
    </div>
  );
}

export function DatasetCards({ imports }: DatasetCardsProps) {
  if (imports.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
        <p className="text-subheading font-medium text-foreground">
          No imports yet
        </p>
        <p className="mt-2 text-body text-muted-foreground">
          Upload a CSV to import contacts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {imports.map((item) => {
        const dedup = item.dedupSummary;
        const commit = item.commitSummary;

        return (
          <article
            key={item.id}
            className="space-y-4 rounded-lg border border-border bg-card p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link
                  href={`/profiles/import/${item.id}`}
                  className="text-subheading font-medium text-foreground hover:underline"
                >
                  {item.filename}
                </Link>
                <p className="text-caption text-muted-foreground">
                  {formatInteractionDate(item.createdAt)} · {item.createdByName}
                </p>
              </div>
              <ImportStatusBadge status={item.status} />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {stat("Rows", item.rowCount)}
              {stat("New", dedup?.new ?? commit?.created ?? 0)}
              {stat("Updated", commit?.updated ?? 0)}
              {stat("Skipped", commit?.skipped ?? 0)}
              {stat("Possible match", dedup?.soft_match ?? 0)}
              {stat("Errors", dedup?.error ?? 0)}
            </div>

            {item.statusHint ? (
              <p className="text-caption text-muted-foreground">{item.statusHint}</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

import type { DedupSummary, ImportRowView } from "@/lib/import/types";

type DedupSummaryPanelProps = {
  summary: DedupSummary | null;
  errorRows: ImportRowView[];
};

export function DedupSummaryPanel({ summary, errorRows }: DedupSummaryPanelProps) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div>
        <h2 className="text-heading font-medium text-foreground">Summary</h2>
        <p className="mt-1 text-body text-muted-foreground">
          Checked automatically on upload. Email matches update the existing
          profile; possible name/company matches need your review below.
        </p>
      </div>

      {summary ? (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-caption text-muted-foreground">Email matches</dt>
            <dd className="text-subheading font-medium">{summary.matched_email}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Needs review</dt>
            <dd className="text-subheading font-medium">{summary.soft_match}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">New profiles</dt>
            <dd className="text-subheading font-medium">{summary.new}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Errors (skipped)</dt>
            <dd className="text-subheading font-medium">{summary.error}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-body text-muted-foreground">
          Checking for duplicates — refresh in a moment.
        </p>
      )}

      {errorRows.length > 0 ? (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-body font-medium text-foreground">
            {errorRows.length} row{errorRows.length === 1 ? "" : "s"} will be
            skipped
          </p>
          <p className="text-caption text-muted-foreground">
            These rows won&rsquo;t be included when you complete the import. Fix
            the source CSV and re-upload if you want them included instead.
          </p>
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/20 p-3">
            {errorRows.map((row) => (
              <li key={row.id} className="text-caption text-muted-foreground">
                Row {row.rowNumber}
                {row.normalized.full_name ? ` — ${row.normalized.full_name}` : ""}:{" "}
                <span className="text-foreground">{row.error}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

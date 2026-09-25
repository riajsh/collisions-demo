import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/app-shell/breadcrumbs";
import { PageHeader } from "@/components/app-shell/page-header";
import { ColumnMappingForm } from "@/components/import/column-mapping-form";
import { DedupSummaryPanel } from "@/components/import/dedup-summary-panel";
import { ImportCommitPanel } from "@/components/import/import-commit-panel";
import { ImportDeleteButton } from "@/components/import/import-delete-button";
import { ImportProfileBackfillButton } from "@/components/import/import-profile-backfill-button";
import { ImportPreviewTable } from "@/components/import/import-preview-table";
import { ImportStatusBadge } from "@/components/import/import-status-badge";
import { SoftMatchReview } from "@/components/import/soft-match-review";
import { requireAdmin } from "@/lib/auth/session";
import { getImportDetail } from "@/lib/data/imports";
import { listEvents } from "@/lib/data/events";
import { formatInteractionDate } from "@/lib/format/date";

type ImportDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ImportDetailPage({ params }: ImportDetailPageProps) {
  await requireAdmin();
  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }

  const [detail, events] = await Promise.all([
    getImportDetail(id),
    listEvents(),
  ]);
  const mapping = detail.metadata.column_mapping ?? {};

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={detail.filename}
        description={`${detail.source} · ${detail.rowCount} rows · uploaded ${formatInteractionDate(detail.createdAt)} by ${detail.createdByName} · ${detail.statusHint}`}
        sticky
      >
        <div className="flex flex-wrap items-center gap-3">
          <ImportStatusBadge status={detail.status} />
          {detail.canDelete ? (
            <ImportDeleteButton
              importId={detail.id}
              filename={detail.filename}
              hasCommitProgress={detail.hasCommitProgress}
            />
          ) : null}
        </div>
      </PageHeader>

      <div className="flex-1 space-y-8 overflow-y-auto px-8 py-6">
        <Breadcrumbs
          items={[
            { label: "Import", href: "/profiles/import" },
            { label: detail.filename },
          ]}
        />

        {detail.status !== "complete" ? (
          <section className="space-y-4">
            <div>
              <h2 className="text-heading font-medium text-foreground">
                Check &amp; fix
              </h2>
              <p className="mt-1 text-body text-muted-foreground">
                We checked this file for duplicates automatically. Resolve
                anything below, then complete the import.
              </p>
            </div>

            <DedupSummaryPanel
              summary={detail.dedupSummary}
              errorRows={detail.errorRows}
            />

            <ColumnMappingForm
              importId={detail.id}
              headers={detail.headers}
              mapping={mapping}
              defaultOpen={detail.mappingNeedsAttention}
            />

            <SoftMatchReview importId={detail.id} rows={detail.softMatchRows} />
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-heading font-medium text-foreground">Complete</h2>
          <ImportCommitPanel
            detail={detail}
            events={events.map((event) => ({ id: event.id, title: event.title }))}
          />
        </section>

        <details className="group rounded-lg border border-border bg-card">
          <summary className="cursor-pointer select-none list-none px-6 py-4 text-body font-medium text-foreground marker:content-none">
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="text-muted-foreground group-open:rotate-90"
              >
                ▸
              </span>
              Preview raw rows
            </span>
          </summary>
          <div className="space-y-3 border-t border-border px-6 py-6">
            <p className="text-body text-muted-foreground">
              First {detail.previewRows.length} rows as parsed from the file.
            </p>
            <ImportPreviewTable rows={detail.previewRows} />
          </div>
        </details>

        {detail.status === "complete" ? (
          <ImportProfileBackfillButton
            importId={detail.id}
            previousSummary={
              detail.metadata.backfill_summary ??
              (detail.metadata.owner_backfill_summary
                ? {
                    profilesUpdated: 0,
                    relationshipsUpdated: 0,
                    ownersAssigned: detail.metadata.owner_backfill_summary.assigned,
                    ownersUnresolved:
                      detail.metadata.owner_backfill_summary.unresolved,
                    tagsLinked: 0,
                    skipped: detail.metadata.owner_backfill_summary.skipped,
                  }
                : null)
            }
          />
        ) : null}

        {detail.metadata.storage_warning ? (
          <p className="text-caption text-muted-foreground">
            Original file was not stored: {detail.metadata.storage_warning}
          </p>
        ) : null}
      </div>
    </div>
  );
}

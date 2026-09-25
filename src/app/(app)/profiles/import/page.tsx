import { PageHeader } from "@/components/app-shell/page-header";
import { DatasetCards } from "@/components/import/dataset-cards";
import { ImportUploadForm } from "@/components/import/import-upload-form";
import { requireAdmin } from "@/lib/auth/session";
import { listImports } from "@/lib/data/imports";
import { listEvents } from "@/lib/data/events";

export default async function ProfilesImportPage() {
  await requireAdmin();
  const [imports, events] = await Promise.all([listImports(), listEvents()]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Import profiles"
        description={`${imports.length} import${imports.length === 1 ? "" : "s"} so far — upload a CSV to add or update profiles, then tag, check, and save them here.`}
        sticky
      />
      <div className="flex-1 space-y-8 overflow-y-auto px-8 py-6">
        <ImportUploadForm
          events={events.map((event) => ({ id: event.id, title: event.title }))}
        />
        <DatasetCards imports={imports} />
      </div>
    </div>
  );
}

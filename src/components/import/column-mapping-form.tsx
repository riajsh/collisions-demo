"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateMappingAndRecheckAction } from "@/app/(app)/profiles/import/actions";
import { ECOSYSTEM_FIELDS } from "@/lib/import/constants";
import type { ColumnMapping } from "@/lib/import/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type ColumnMappingFormProps = {
  importId: string;
  headers: string[];
  mapping: ColumnMapping;
  defaultOpen?: boolean;
};

export function ColumnMappingForm({
  importId,
  headers,
  mapping,
  defaultOpen = false,
}: ColumnMappingFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave(formData: FormData) {
    setError(null);
    setIsSaving(true);

    try {
      const result = await updateMappingAndRecheckAction(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <details
      className="group rounded-lg border border-border bg-card"
      open={defaultOpen}
    >
      <summary className="cursor-pointer select-none list-none px-6 py-4 text-body font-medium text-foreground marker:content-none">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="text-muted-foreground group-open:rotate-90">
            ▸
          </span>
          Fix column mapping
        </span>
        <span className="ml-2 font-normal text-muted-foreground">
          — open this if names, emails, or companies didn&rsquo;t come through
          correctly
        </span>
      </summary>

      <div className="space-y-6 border-t border-border px-6 py-6">
        <p className="text-body text-muted-foreground">
          Map CSV columns to Ecosystem fields. Unmapped columns are stored on the
          profile under their original header names. No single &ldquo;Full
          name&rdquo; column? Map &ldquo;First name&rdquo; and &ldquo;Last
          name&rdquo; separately and they&rsquo;ll be combined automatically.
        </p>

        <form action={handleSave} className="space-y-4">
          <input type="hidden" name="importId" value={importId} />

          {headers.map((header) => (
            <div
              key={header}
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center"
            >
              <Label className="text-body text-foreground">{header}</Label>
              <select
                name={`map:${header}`}
                defaultValue={mapping[header] ?? ""}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-body"
                disabled={isSaving}
              >
                <option value="">Do not map</option>
                {ECOSYSTEM_FIELDS.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                    {field.required ? " *" : ""}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving & rechecking…" : "Save & recheck"}
          </Button>
        </form>

        {error ? (
          <p className="text-body text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}

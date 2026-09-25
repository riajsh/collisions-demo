"use server";

import { revalidatePath } from "next/cache";

import {
  applyColumnMappingToImport,
  attachImportToEvent,
  backfillImportProfiles,
  cancelImport,
  deleteImport,
  getImportProgress,
  reopenImport,
  resolveSoftMatch,
  runImportDedup,
  saveColumnMapping,
  updateMappingAndRecheck,
  uploadAndParseImport,
} from "@/lib/data/imports";
import { createEvent } from "@/lib/data/events";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/import/constants";
import type { ColumnMapping } from "@/lib/import/types";
import {
  columnMappingSchema,
  importIdSchema,
  softMatchActionSchema,
  uploadImportSchema,
} from "@/lib/validators/imports";
import { createEventSchema } from "@/lib/validators/events";
import { postgresUuidSchema } from "@/lib/validators/id";

function revalidateImport(importId: string) {
  revalidatePath("/profiles");
  revalidatePath("/profiles/import");
  revalidatePath(`/profiles/import/${importId}`);
}

export async function uploadImportAction(formData: FormData) {
  const parsed = uploadImportSchema.safeParse({
    source: formData.get("source"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid source" };
  }

  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to upload" };
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return { error: "Only CSV files are supported in V1" };
  }

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { error: "File exceeds the 10 MB limit" };
  }

  let importId: string;

  try {
    const csvText = await file.text();
    importId = await uploadAndParseImport({
      filename: file.name,
      source: parsed.data.source,
      csvText,
    });

    const newEventTitle = formData.get("newEventTitle");
    const rawEventId = formData.get("eventId");

    if (typeof newEventTitle === "string" && newEventTitle.trim()) {
      const parsedEvent = createEventSchema.safeParse({
        title: newEventTitle,
        eventDate: formData.get("newEventDate"),
      });

      if (!parsedEvent.success) {
        revalidateImport(importId);
        return {
          importId,
          eventWarning:
            parsedEvent.error.issues[0]?.message ?? "Invalid new event details",
        };
      }

      const createdEvent = await createEvent(parsedEvent.data);
      await attachImportToEvent(importId, createdEvent.id);
    } else if (typeof rawEventId === "string" && rawEventId.trim()) {
      const parsedEventId = postgresUuidSchema.safeParse(rawEventId);
      if (parsedEventId.success) {
        await attachImportToEvent(importId, parsedEventId.data);
      }
    }

    revalidateImport(importId);
    return { importId };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

export async function saveMappingAction(formData: FormData) {
  const importId = formData.get("importId");
  const parsedId = importIdSchema.safeParse(importId);

  if (!parsedId.success) {
    return { error: "Invalid import ID" };
  }

  const mapping: ColumnMapping = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("map:")) {
      continue;
    }

    const header = key.slice(4);
    if (typeof value === "string") {
      mapping[header] = value as ColumnMapping[string];
    }
  }

  const parsedMapping = columnMappingSchema.safeParse(mapping);
  if (!parsedMapping.success) {
    return { error: "Invalid column mapping" };
  }

  try {
    await saveColumnMapping(parsedId.data, parsedMapping.data as ColumnMapping);
    revalidateImport(parsedId.data);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save mapping",
    };
  }
}

export async function applyMappingAction(formData: FormData) {
  const parsedId = importIdSchema.safeParse(formData.get("importId"));

  if (!parsedId.success) {
    return { error: "Invalid import ID" };
  }

  try {
    await applyColumnMappingToImport(parsedId.data);
    revalidateImport(parsedId.data);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to apply mapping",
    };
  }
}

/** Save a corrected column mapping and re-check for duplicates in one go —
 * the "fix mapping" fallback on the streamlined Check & fix screen. */
export async function updateMappingAndRecheckAction(formData: FormData) {
  const parsedId = importIdSchema.safeParse(formData.get("importId"));

  if (!parsedId.success) {
    return { error: "Invalid import ID" };
  }

  const mapping: ColumnMapping = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("map:")) {
      continue;
    }

    const header = key.slice(4);
    if (typeof value === "string") {
      mapping[header] = value as ColumnMapping[string];
    }
  }

  const parsedMapping = columnMappingSchema.safeParse(mapping);
  if (!parsedMapping.success) {
    return { error: "Invalid column mapping" };
  }

  try {
    await updateMappingAndRecheck(parsedId.data, parsedMapping.data as ColumnMapping);
    revalidateImport(parsedId.data);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to update mapping",
    };
  }
}

export async function runDedupAction(formData: FormData) {
  const parsedId = importIdSchema.safeParse(formData.get("importId"));

  if (!parsedId.success) {
    return { error: "Invalid import ID" };
  }

  try {
    await runImportDedup(parsedId.data);
    revalidateImport(parsedId.data);
    return { success: true as const };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to check for duplicates",
    };
  }
}

export async function resolveSoftMatchAction(formData: FormData) {
  const parsedId = importIdSchema.safeParse(formData.get("importId"));
  const parsedRowId = importIdSchema.safeParse(formData.get("rowId"));
  const parsedAction = softMatchActionSchema.safeParse(formData.get("action"));

  if (!parsedId.success || !parsedRowId.success || !parsedAction.success) {
    return { error: "Invalid soft match request" };
  }

  try {
    const selectedProfileId = formData.get("matchedProfileId");
    await resolveSoftMatch(
      parsedRowId.data,
      parsedAction.data,
      typeof selectedProfileId === "string" ? selectedProfileId : null,
    );
    revalidateImport(parsedId.data);
    return { success: true as const };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to resolve soft match",
    };
  }
}

/**
 * One-time prep before completing an import: attaches (or creates) the
 * chosen event, if any. Does NOT run the commit itself — the actual work
 * happens in small automatic bursts against /api/profiles/import/[id]/chunk,
 * driven by the browser, so no single request runs long enough to risk a
 * platform timeout or hold onto the database's connections for minutes.
 */
export async function prepareCommitAction(formData: FormData) {
  const parsedId = importIdSchema.safeParse(formData.get("importId"));

  if (!parsedId.success) {
    return { error: "Invalid import ID" };
  }

  try {
    const newEventTitle = formData.get("newEventTitle");
    const rawEventId = formData.get("eventId");

    if (typeof newEventTitle === "string" && newEventTitle.trim()) {
      const parsedEvent = createEventSchema.safeParse({
        title: newEventTitle,
        eventDate: formData.get("newEventDate"),
      });

      if (!parsedEvent.success) {
        return {
          error:
            parsedEvent.error.issues[0]?.message ?? "Invalid new event details",
        };
      }

      const createdEvent = await createEvent(parsedEvent.data);
      await attachImportToEvent(parsedId.data, createdEvent.id);
    } else if (typeof rawEventId === "string" && rawEventId.trim()) {
      const parsedEventId = postgresUuidSchema.safeParse(rawEventId);
      if (!parsedEventId.success) {
        return { error: "Invalid event selected" };
      }
      await attachImportToEvent(parsedId.data, parsedEventId.data);
    }

    revalidateImport(parsedId.data);
    revalidatePath("/events");
    return { success: true as const };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to prepare import",
    };
  }
}

export async function getImportProgressAction(importId: string) {
  const parsedId = importIdSchema.safeParse(importId);

  if (!parsedId.success) {
    return { error: "Invalid import ID" };
  }

  try {
    const progress = await getImportProgress(parsedId.data);
    return { progress };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to load progress",
    };
  }
}

export async function deleteImportAction(formData: FormData) {
  const parsedId = importIdSchema.safeParse(formData.get("importId"));

  if (!parsedId.success) {
    return { error: "Invalid import ID" };
  }

  try {
    await deleteImport(parsedId.data);
    revalidatePath("/profiles");
    revalidatePath("/profiles/import");
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to delete import",
    };
  }
}

export async function cancelImportAction(formData: FormData) {
  const parsedId = importIdSchema.safeParse(formData.get("importId"));

  if (!parsedId.success) {
    return { error: "Invalid import ID" };
  }

  try {
    await cancelImport(parsedId.data);
    revalidatePath("/profiles");
    revalidatePath("/profiles/import");
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to cancel import",
    };
  }
}

export async function backfillImportProfilesAction(formData: FormData) {
  const parsedId = importIdSchema.safeParse(formData.get("importId"));

  if (!parsedId.success) {
    return { error: "Invalid import ID" };
  }

  try {
    const summary = await backfillImportProfiles(parsedId.data);
    revalidateImport(parsedId.data);
    revalidatePath("/profiles");
    return { summary };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to apply import data",
    };
  }
}

export async function reopenImportAction(formData: FormData) {
  const parsedId = importIdSchema.safeParse(formData.get("importId"));

  if (!parsedId.success) {
    return { error: "Invalid import ID" };
  }

  try {
    await reopenImport(parsedId.data);
    revalidateImport(parsedId.data);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to reopen import",
    };
  }
}

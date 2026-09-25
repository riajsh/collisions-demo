import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { notFound } from "next/navigation";
import { after } from "next/server";

import { getOrgId, requireAdmin } from "@/lib/auth/session";
import { inferCoAttendanceForEvent } from "@/lib/computed/infer-connections";
import { ensureEventAttendanceEvidence } from "@/lib/data/events";
import { enrichAndTagProfile } from "@/lib/data/profile-attributes";
import {
  guessColumnMapping,
  MAX_IMPORT_ROWS,
  PREVIEW_ROW_LIMIT,
} from "@/lib/import/constants";
import {
  assignOwnerFromNormalized,
  backfillProfileFieldsFromNormalized,
  backfillRelationshipFromNormalized,
  linkProfileTagsFromNormalized,
  resolveProfileIdForImportRow,
} from "@/lib/import/backfill-row";
import { parseCsv } from "@/lib/import/csv";
import {
  applyColumnMapping,
  normalizeRowFromImport,
  parseTags,
  validateNormalizedRow,
} from "@/lib/import/mapping";
import {
  findLinkedinMatches,
  findNameCompanyMatches,
  findPhoneMatches,
} from "@/lib/dedup/match-profiles";
import { nameCompanyDedupKey } from "@/lib/dedup/name-company";
import {
  getCandidateProfileIds,
  getInFileMatchRowNumber,
  getReplaceProfileId,
  withCandidateProfileIds,
  withMergeInFileRowNumber,
  withInFileMatchRowNumber,
  withReplaceProfileId,
} from "@/lib/import/in-file-dedup";
import { deleteProfile } from "@/lib/data/profiles";
import { resolveOrgUserId, type OrgUserRecord } from "@/lib/import/resolve-owner";
import type {
  ColumnMapping,
  CommitSummary,
  DedupSummary,
  ImportCommitCheckpoint,
  ImportDetail,
  ImportListItem,
  ImportMetadata,
  ImportRowView,
  ImportStatus,
  NormalizedImportRow,
  SoftMatchAction,
} from "@/lib/import/types";
import {
  applyImportCommitRollbacks,
  type RelationshipGraphRollback,
  type RelationshipOwnerSnapshot,
} from "@/lib/data/import-commit-rollback";
import { normaliseOrganisationName } from "@/lib/normalise/organisation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type DedupStatus = Database["public"]["Enums"]["dedup_status"];
type RelationshipStatus = Database["public"]["Enums"]["relationship_status"];
type RelationshipType = Database["public"]["Enums"]["relationship_type"];
type OwnerStrength = Database["public"]["Enums"]["owner_strength"];
type SupabaseImportClient = SupabaseClient<Database>;

type ImportRowRecord = {
  id: string;
  row_number: number;
  raw: Record<string, string>;
  normalized: NormalizedImportRow;
  dedup_status: DedupStatus;
  matched_profile_id: string | null;
  error: string | null;
  matched_profile?: {
    full_name: string;
    organisation_name: string | null;
  } | null;
};

function parseMetadata(metadata: unknown): ImportMetadata {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  return metadata as ImportMetadata;
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      record[key] = entry;
    } else if (entry != null) {
      record[key] = String(entry);
    }
  }
  return record;
}

function asNormalized(value: unknown): NormalizedImportRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as NormalizedImportRow;
}

function mapImportRow(
  row: ImportRowRecord,
  rowsByNumber?: Map<number, ImportRowRecord>,
  profilesById?: Map<
    string,
    {
      full_name: string;
      organisation_name: string | null;
      email: string | null;
    }
  >,
): ImportRowView {
  const inFileRowNumber = getInFileMatchRowNumber(row.normalized);
  const inFileRow = inFileRowNumber ? rowsByNumber?.get(inFileRowNumber) : undefined;
  const candidateIds = [
    ...new Set([
      ...getCandidateProfileIds(row.normalized),
      ...(row.matched_profile_id ? [row.matched_profile_id] : []),
    ]),
  ];
  const matchedProfileCandidates = candidateIds.flatMap((profileId) => {
    const profile = profilesById?.get(profileId);
    if (!profile) {
      return [];
    }

    return [
      {
        id: profileId,
        fullName: profile.full_name,
        organisationName: profile.organisation_name,
        email: profile.email,
      },
    ];
  });
  const primaryCandidate = row.matched_profile_id
    ? profilesById?.get(row.matched_profile_id)
    : undefined;

  return {
    id: row.id,
    rowNumber: row.row_number,
    raw: row.raw,
    normalized: row.normalized,
    dedupStatus: row.dedup_status,
    matchedProfileId: row.matched_profile_id,
    matchedProfileName:
      primaryCandidate?.full_name ??
      row.matched_profile?.full_name ??
      inFileRow?.normalized.full_name ??
      matchedProfileCandidates[0]?.fullName ??
      null,
    matchedProfileCompany:
      primaryCandidate?.organisation_name ??
      row.matched_profile?.organisation_name ??
      inFileRow?.normalized.organisation_name ??
      matchedProfileCandidates[0]?.organisationName ??
      null,
    matchedInFileRowNumber: inFileRowNumber,
    matchedInFileRowEmail: inFileRow?.normalized.email ?? null,
    matchedProfileCandidates,
    error: row.error,
  };
}

function canDeleteImport(
  status: ImportStatus,
  commitSummary: CommitSummary | null | undefined,
): boolean {
  if (status === "complete") {
    if (!commitSummary) {
      return true;
    }
    return commitSummary.created + commitSummary.updated === 0;
  }

  return true;
}

function importStatusHint(
  status: ImportStatus,
  metadata: ImportMetadata,
): string {
  if (status === "pending") {
    return "Not started";
  }

  if (status === "failed") {
    return metadata.errors?.[0] ?? "Failed";
  }

  if (status === "complete") {
    const summary = metadata.commit_summary;
    if (!summary) {
      return "Complete";
    }
    return `${summary.created} created, ${summary.updated} updated`;
  }

  if (!metadata.mapping_confirmed) {
    return "Fix column mapping";
  }

  if (!metadata.dedup_summary) {
    return "Checking for duplicates…";
  }

  const dedup = metadata.dedup_summary;
  if (dedup.soft_match > 0) {
    return `${dedup.soft_match} row${dedup.soft_match === 1 ? "" : "s"} to review`;
  }

  const ready = dedup.matched_email + dedup.new;
  if (ready === 0) {
    return "No rows ready — check errors";
  }

  return `Ready to complete (${ready} rows)`;
}

function emptyDedupSummary(): DedupSummary {
  return { matched_email: 0, soft_match: 0, new: 0, error: 0 };
}

function countDedupStatuses(rows: Array<{ dedup_status: DedupStatus }>): DedupSummary {
  const summary = emptyDedupSummary();

  for (const row of rows) {
    if (row.dedup_status === "matched_email") {
      summary.matched_email += 1;
    } else if (row.dedup_status === "soft_match") {
      summary.soft_match += 1;
    } else if (row.dedup_status === "new") {
      summary.new += 1;
    } else if (row.dedup_status === "error") {
      summary.error += 1;
    }
  }

  return summary;
}

async function getImportRecord(importId: string, orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imports")
    .select(
      `
      id,
      filename,
      source,
      row_count,
      status,
      metadata,
      created_at,
      created_by,
      event_id,
      events (
        id,
        title,
        event_date
      ),
      users!imports_created_by_fkey (
        full_name
      )
    `,
    )
    .eq("id", importId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load import: ${error.message}`);
  }

  if (!data) {
    notFound();
  }

  return data;
}

async function loadImportRows(importId: string, orgId: string): Promise<ImportRowRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_rows")
    .select(
      `
      id,
      row_number,
      raw,
      normalized,
      dedup_status,
      matched_profile_id,
      error,
      matched_profile:profiles!import_rows_matched_profile_id_fkey (
        full_name,
        organisation_name
      )
    `,
    )
    .eq("import_id", importId)
    .eq("org_id", orgId)
    .order("row_number");

  if (error) {
    throw new Error(`Failed to load import rows: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    row_number: row.row_number,
    raw: asRecord(row.raw),
    normalized: asNormalized(row.normalized),
    dedup_status: row.dedup_status,
    matched_profile_id: row.matched_profile_id,
    error: row.error,
    matched_profile: row.matched_profile,
  }));
}

export async function listImports(): Promise<ImportListItem[]> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("imports")
    .select(
      `
      id,
      filename,
      source,
      row_count,
      status,
      metadata,
      created_at,
      users!imports_created_by_fkey (
        full_name
      )
    `,
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list imports: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const metadata = parseMetadata(row.metadata);
    const commitSummary = metadata.commit_summary ?? null;
    return {
      id: row.id,
      filename: row.filename,
      source: row.source,
      rowCount: row.row_count,
      status: row.status,
      createdAt: row.created_at,
      createdByName: row.users?.full_name ?? "Unknown",
      statusHint: importStatusHint(row.status, metadata),
      canDelete: canDeleteImport(row.status, commitSummary),
      dedupSummary: metadata.dedup_summary ?? null,
      commitSummary,
    };
  });
}

export async function getImportDetail(importId: string): Promise<ImportDetail> {
  await requireAdmin();
  const orgId = await getOrgId();
  const [importRecord, rows] = await Promise.all([
    getImportRecord(importId, orgId),
    loadImportRows(importId, orgId),
  ]);

  const metadata = parseMetadata(importRecord.metadata);
  const headers = metadata.headers ?? inferHeadersFromRows(rows);
  const rowsByNumber = new Map(rows.map((row) => [row.row_number, row]));
  const candidateProfileIds = new Set<string>();

  for (const row of rows) {
    for (const profileId of getCandidateProfileIds(row.normalized)) {
      candidateProfileIds.add(profileId);
    }

    if (row.matched_profile_id) {
      candidateProfileIds.add(row.matched_profile_id);
    }
  }

  const profilesById = new Map<
    string,
    {
      full_name: string;
      organisation_name: string | null;
      email: string | null;
    }
  >();

  if (candidateProfileIds.size > 0) {
    const supabase = await createClient();
    const { data: candidateProfiles, error: candidateError } = await supabase
      .from("profiles")
      .select("id, full_name, organisation_name, email")
      .eq("org_id", orgId)
      .in("id", [...candidateProfileIds]);

    if (candidateError) {
      throw new Error(
        `Failed to load soft-match candidates: ${candidateError.message}`,
      );
    }

    for (const profile of candidateProfiles ?? []) {
      profilesById.set(profile.id, profile);
    }
  }

  const mappedRows = rows.map((row) => mapImportRow(row, rowsByNumber, profilesById));
  const softMatchRows = mappedRows.filter((row) => row.dedupStatus === "soft_match");
  const errorRows = mappedRows.filter((row) => row.dedupStatus === "error");
  const unresolvedSoftMatches = softMatchRows.length;
  const dedupSummary =
    metadata.dedup_summary ??
    (metadata.mapping_confirmed ? countDedupStatuses(rows) : null);
  const committableRowCount = rows.filter(
    (row) =>
      row.dedup_status === "matched_email" || row.dedup_status === "new",
  ).length;
  const pendingRowCount = rows.filter((row) => row.dedup_status === "pending").length;
  // If the auto-guessed column mapping produced no usable rows at all, the
  // mapping is almost certainly wrong (e.g. no name column was recognised) —
  // surface the "fix mapping" option opened by default in that case.
  const mappingNeedsAttention = Boolean(
    dedupSummary &&
      rows.length > 0 &&
      dedupSummary.matched_email + dedupSummary.soft_match + dedupSummary.new === 0,
  );

  const canCommit =
    importRecord.status === "processing" &&
    Boolean(metadata.mapping_confirmed) &&
    Boolean(metadata.dedup_summary) &&
    unresolvedSoftMatches === 0 &&
    pendingRowCount === 0 &&
    committableRowCount > 0 &&
    !metadata.commit_checkpoint;

  return {
    id: importRecord.id,
    filename: importRecord.filename,
    source: importRecord.source,
    rowCount: importRecord.row_count,
    status: importRecord.status,
    createdAt: importRecord.created_at,
    createdByName: importRecord.users?.full_name ?? "Unknown",
    metadata,
    headers,
    previewRows: mappedRows.slice(0, PREVIEW_ROW_LIMIT),
    softMatchRows,
    errorRows,
    mappingNeedsAttention,
    dedupSummary,
    commitSummary: metadata.commit_summary ?? null,
    unresolvedSoftMatches,
    committableRowCount,
    pendingRowCount,
    statusHint: importStatusHint(importRecord.status, metadata),
    canDelete: canDeleteImport(importRecord.status, metadata.commit_summary),
    canCommit,
    hasCommitProgress: Boolean(metadata.commit_checkpoint),
    eventId: importRecord.event_id,
    eventTitle: importRecord.events?.title ?? null,
  };
}

function inferHeadersFromRows(rows: ImportRowRecord[]): string[] {
  const headerSet = new Set<string>();
  for (const row of rows) {
    Object.keys(row.raw).forEach((header) => headerSet.add(header));
  }
  return [...headerSet];
}

export async function uploadAndParseImport(input: {
  filename: string;
  source: Database["public"]["Tables"]["imports"]["Insert"]["source"];
  csvText: string;
}): Promise<string> {
  const user = await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const parsed = parseCsv(input.csvText);

  if (parsed.rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Import exceeds the ${MAX_IMPORT_ROWS.toLocaleString()} row limit`);
  }

  const { data: inProgress, error: inProgressError } = await supabase
    .from("imports")
    .select("id")
    .eq("org_id", orgId)
    .eq("filename", input.filename)
    .eq("status", "processing")
    .limit(1);

  if (inProgressError) {
    throw new Error(`Failed to check existing imports: ${inProgressError.message}`);
  }

  if (inProgress && inProgress.length > 0) {
    throw new Error(
      `"${input.filename}" is already in progress. Open it from history or delete it before uploading again.`,
    );
  }

  const columnMapping = guessColumnMapping(parsed.headers);
  const metadata: ImportMetadata = {
    headers: parsed.headers,
    column_mapping: columnMapping,
    // Mapping is guessed automatically and applied to every row below, so
    // there's no separate "confirm mapping" click in the streamlined flow.
    // Admins can still fix a bad guess from the review screen, which resaves
    // this as false while it re-normalises rows.
    mapping_confirmed: true,
  };

  const { data: importRecord, error: importError } = await supabase
    .from("imports")
    .insert({
      org_id: orgId,
      filename: input.filename,
      source: input.source,
      row_count: parsed.rows.length,
      status: "processing",
      created_by: user.id,
      metadata,
    })
    .select("id")
    .single();

  if (importError) {
    throw new Error(`Failed to create import: ${importError.message}`);
  }

  const importRows = parsed.rows.map((raw, index) => ({
    org_id: orgId,
    import_id: importRecord.id,
    row_number: index + 1,
    raw,
    normalized: applyColumnMapping(raw, columnMapping),
    dedup_status: "pending" as const,
  }));

  const batchSize = 200;
  for (let offset = 0; offset < importRows.length; offset += batchSize) {
    const batch = importRows.slice(offset, offset + batchSize);
    const { error: rowsError } = await supabase.from("import_rows").insert(batch);

    if (rowsError) {
      await supabase
        .from("imports")
        .update({
          status: "failed",
          metadata: {
            ...metadata,
            errors: [rowsError.message],
          },
        })
        .eq("id", importRecord.id);

      throw new Error(`Failed to stage import rows: ${rowsError.message}`);
    }
  }

  try {
    const admin = createAdminClient();
    const storagePath = `${orgId}/imports/${importRecord.id}/original.csv`;
    const { error: storageError } = await admin.storage
      .from("imports")
      .upload(storagePath, Buffer.from(input.csvText, "utf-8"), {
        contentType: "text/csv",
        upsert: true,
      });

    if (storageError) {
      await supabase
        .from("imports")
        .update({
          metadata: {
            ...metadata,
            storage_warning: storageError.message,
          },
        })
        .eq("id", importRecord.id);
    } else {
      await supabase
        .from("imports")
        .update({
          metadata: {
            ...metadata,
            storage_path: storagePath,
          },
        })
        .eq("id", importRecord.id);
    }
  } catch {
    await supabase
      .from("imports")
      .update({
        metadata: {
          ...metadata,
          storage_warning: "Original file storage is unavailable",
        },
      })
      .eq("id", importRecord.id);
  }

  // Dedup runs immediately so the admin lands on a "check & fix" screen
  // straight away, instead of needing a separate manual step.
  try {
    await runImportDedup(importRecord.id);
  } catch (dedupError) {
    await supabase
      .from("imports")
      .update({
        metadata: {
          ...metadata,
          errors: [
            dedupError instanceof Error
              ? dedupError.message
              : "Automatic duplicate check failed",
          ],
        },
      })
      .eq("id", importRecord.id);
  }

  return importRecord.id;
}

export async function saveColumnMapping(
  importId: string,
  mapping: ColumnMapping,
): Promise<void> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();
  const importRecord = await getImportRecord(importId, orgId);
  const metadata = parseMetadata(importRecord.metadata);

  const { error } = await supabase
    .from("imports")
    .update({
      metadata: {
        ...metadata,
        column_mapping: mapping,
        mapping_confirmed: false,
        dedup_summary: undefined,
      },
      status: "processing",
    })
    .eq("id", importId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to save column mapping: ${error.message}`);
  }
}

export async function applyColumnMappingToImport(importId: string): Promise<void> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();
  const importRecord = await getImportRecord(importId, orgId);
  const metadata = parseMetadata(importRecord.metadata);
  const mapping = metadata.column_mapping;

  if (!mapping || Object.keys(mapping).length === 0) {
    throw new Error("Column mapping is required before applying");
  }

  const rows = await loadImportRows(importId, orgId);
  const headers = metadata.headers ?? inferHeadersFromRows(rows);
  const rowUpdates = rows.map((row) => ({
    id: row.id,
    org_id: orgId,
    import_id: importId,
    row_number: row.row_number,
    raw: row.raw,
    normalized: normalizeRowFromImport(row.raw, headers, mapping, row.normalized),
    dedup_status: "pending" as const,
    matched_profile_id: null,
    error: null,
  }));

  const batchSize = 200;
  for (let index = 0; index < rowUpdates.length; index += batchSize) {
    const batch = rowUpdates.slice(index, index + batchSize);
    const { error } = await supabase.from("import_rows").upsert(batch, {
      onConflict: "id",
    });

    if (error) {
      throw new Error(`Failed to apply column mapping: ${error.message}`);
    }
  }

  const { error: importError } = await supabase
    .from("imports")
    .update({
      metadata: {
        ...metadata,
        mapping_confirmed: true,
        dedup_summary: undefined,
      },
    })
    .eq("id", importId)
    .eq("org_id", orgId);

  if (importError) {
    throw new Error(`Failed to confirm mapping: ${importError.message}`);
  }
}

/**
 * One-click fallback for when the auto-guessed column mapping is wrong:
 * saves the corrected mapping, re-normalises every row against it, and
 * re-runs dedup — the three separate steps this used to take, combined into
 * a single action so the streamlined upload flow only needs a "fix mapping"
 * button rather than a mini multi-step wizard of its own.
 */
export async function updateMappingAndRecheck(
  importId: string,
  mapping: ColumnMapping,
): Promise<DedupSummary> {
  await saveColumnMapping(importId, mapping);
  await applyColumnMappingToImport(importId);
  return runImportDedup(importId);
}

export async function runImportDedup(importId: string): Promise<DedupSummary> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();
  const importRecord = await getImportRecord(importId, orgId);
  const metadata = parseMetadata(importRecord.metadata);

  if (!metadata.mapping_confirmed) {
    throw new Error("Apply column mapping before running dedup");
  }

  const [rows, profilesResult] = await Promise.all([
    loadImportRows(importId, orgId),
    supabase
      .from("profiles")
      .select("id, email, full_name, organisation_name, phone, linkedin_url")
      .eq("org_id", orgId),
  ]);

  if (profilesResult.error) {
    throw new Error(`Failed to load profiles for dedup: ${profilesResult.error.message}`);
  }

  const profiles = profilesResult.data ?? [];
  const emailIndex = new Map<string, string>();

  for (const profile of profiles) {
    if (profile.email) {
      emailIndex.set(profile.email.toLowerCase(), profile.id);
    }
  }

  const seenEmails = new Map<string, number>();
  const seenNameCompany = new Map<string, number>();
  const summary = emptyDedupSummary();
  const mapping = metadata.column_mapping ?? {};
  const headers = metadata.headers ?? inferHeadersFromRows(rows);
  const rowUpdates: Array<{
    id: string;
    org_id: string;
    import_id: string;
    row_number: number;
    raw: Record<string, string>;
    normalized: NormalizedImportRow;
    dedup_status: DedupStatus;
    matched_profile_id: string | null;
    error: string | null;
  }> = [];

  for (const row of rows) {
    let normalized = normalizeRowFromImport(row.raw, headers, mapping, row.normalized);
    const validationError = validateNormalizedRow(normalized);
    let dedupStatus: DedupStatus = "pending";
    let matchedProfileId: string | null = null;
    let error: string | null = validationError;

    if (validationError) {
      dedupStatus = "error";
    } else if (normalized.email) {
      const email = normalized.email.toLowerCase();
      const firstRow = seenEmails.get(email);

      if (firstRow !== undefined) {
        dedupStatus = "error";
        error = "duplicate in file";
      } else {
        seenEmails.set(email, row.row_number);
        const existingId = emailIndex.get(email);

        if (existingId) {
          dedupStatus = "matched_email";
          matchedProfileId = existingId;
        }
      }
    }

    if (!error && dedupStatus === "pending") {
      const phoneMatches = findPhoneMatches(normalized.phone, profiles);
      if (phoneMatches.length > 0) {
        dedupStatus = "soft_match";
        matchedProfileId = phoneMatches[0] ?? null;
        normalized = withCandidateProfileIds(normalized, phoneMatches);
      }
    }

    if (!error && dedupStatus === "pending") {
      const linkedinMatches = findLinkedinMatches(normalized.linkedin_url, profiles);
      if (linkedinMatches.length > 0) {
        dedupStatus = "soft_match";
        matchedProfileId = linkedinMatches[0] ?? null;
        normalized = withCandidateProfileIds(normalized, linkedinMatches);
      }
    }

    if (!error && dedupStatus === "pending") {
      const key = nameCompanyDedupKey(
        normalized.full_name,
        normalized.organisation_name,
      );

      if (key) {
        const firstInFileRow = seenNameCompany.get(key);

        if (firstInFileRow !== undefined) {
          dedupStatus = "soft_match";
          normalized = withInFileMatchRowNumber(normalized, firstInFileRow);
        } else {
          seenNameCompany.set(key, row.row_number);
          const candidateIds = findNameCompanyMatches(
            normalized.full_name,
            normalized.organisation_name,
            profiles,
            { includeFuzzy: true },
          );

          if (candidateIds.length > 0) {
            dedupStatus = "soft_match";
            matchedProfileId = candidateIds[0] ?? null;
            normalized = withCandidateProfileIds(normalized, candidateIds);
          }
        }
      }
    }

    if (!error && dedupStatus === "pending") {
      dedupStatus = "new";
    }

    if (dedupStatus === "matched_email") {
      summary.matched_email += 1;
    } else if (dedupStatus === "soft_match") {
      summary.soft_match += 1;
    } else if (dedupStatus === "new") {
      summary.new += 1;
    } else if (dedupStatus === "error") {
      summary.error += 1;
    }

    rowUpdates.push({
      id: row.id,
      org_id: orgId,
      import_id: importId,
      row_number: row.row_number,
      raw: row.raw,
      normalized,
      dedup_status: dedupStatus,
      matched_profile_id: matchedProfileId,
      error,
    });
  }

  const batchSize = 200;
  for (let index = 0; index < rowUpdates.length; index += batchSize) {
    const batch = rowUpdates.slice(index, index + batchSize);
    const { error: updateError } = await supabase.from("import_rows").upsert(batch, {
      onConflict: "id",
    });

    if (updateError) {
      throw new Error(`Failed to update dedup rows: ${updateError.message}`);
    }
  }

  const { error: importError } = await supabase
    .from("imports")
    .update({
      metadata: {
        ...metadata,
        dedup_summary: summary,
      },
    })
    .eq("id", importId)
    .eq("org_id", orgId);

  if (importError) {
    throw new Error(`Failed to save dedup summary: ${importError.message}`);
  }

  return summary;
}

async function loadOrgUserRecords(orgId: string): Promise<OrgUserRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name")
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to load org users: ${error.message}`);
  }

  return (data ?? []).map((user) => ({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
  }));
}

async function runConcurrentMap<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runWorker),
  );

  return results;
}

export async function deleteImport(importId: string): Promise<void> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();
  const importRecord = await getImportRecord(importId, orgId);
  const metadata = parseMetadata(importRecord.metadata);

  if (!canDeleteImport(importRecord.status, metadata.commit_summary)) {
    throw new Error("This import created profiles and cannot be deleted");
  }

  const { error } = await supabase
    .from("imports")
    .delete()
    .eq("id", importId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to delete import: ${error.message}`);
  }
}

/**
 * Undoes whatever a (now-cancelled) commit has written so far: deletes any
 * profiles it created, restores any it updated back to their prior values,
 * restores any profile it deleted for a "replace" row, and reverses any
 * relationship/tag/event-attendee graph changes. Shared between a commit
 * that fails on its own (commitImport's catch block) and an admin
 * explicitly cancelling an in-progress import.
 */
async function rollbackImportCommitProgress(
  supabase: SupabaseImportClient,
  orgId: string,
  progress: {
    createdProfileIds: string[];
    updatedProfileSnapshots: Record<
      string,
      Database["public"]["Tables"]["profiles"]["Update"]
    >;
    deletedProfileSnapshots: Record<
      string,
      Database["public"]["Tables"]["profiles"]["Row"]
    >;
    graphRollbacks: RelationshipGraphRollback[];
  },
): Promise<void> {
  if (progress.createdProfileIds.length > 0) {
    await supabase
      .from("profiles")
      .delete()
      .in("id", progress.createdProfileIds)
      .eq("org_id", orgId);
  }

  for (const [profileId, snapshot] of Object.entries(
    progress.updatedProfileSnapshots,
  )) {
    await supabase
      .from("profiles")
      .update(snapshot)
      .eq("id", profileId)
      .eq("org_id", orgId);
  }

  for (const snapshot of Object.values(progress.deletedProfileSnapshots)) {
    // Best-effort: restores the deleted profile row itself. Relationships,
    // tags, and event attendance that were cascade-deleted with it are not
    // recreated. Upsert (rather than insert) so this stays safe to run
    // twice — e.g. if a Cancel click and this same commit's own failure
    // handling both race to roll back the same "replace" row.
    await supabase
      .from("profiles")
      .upsert(snapshot as Database["public"]["Tables"]["profiles"]["Insert"], {
        onConflict: "id",
        ignoreDuplicates: true,
      });
  }

  await applyImportCommitRollbacks(supabase, orgId, progress.graphRollbacks);
}

/**
 * Cancels an import that hasn't finished yet. If nothing has been written
 * to real profiles, this just removes the staged import. If a commit was
 * started (even if it's mid-flight or was interrupted), it first undoes
 * everything that commit has done so far, then removes the import.
 */
export async function cancelImport(importId: string): Promise<void> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();
  const importRecord = await getImportRecord(importId, orgId);
  const metadata = parseMetadata(importRecord.metadata);

  if (
    importRecord.status === "complete" &&
    !canDeleteImport(importRecord.status, metadata.commit_summary)
  ) {
    throw new Error(
      "This import already finished and created profiles — it can't be cancelled. Merge or delete individual profiles from Profiles instead.",
    );
  }

  const checkpoint = metadata.commit_checkpoint;
  if (checkpoint) {
    await rollbackImportCommitProgress(supabase, orgId, {
      createdProfileIds: checkpoint.created_profile_ids,
      updatedProfileSnapshots: checkpoint.updated_profile_snapshots as Record<
        string,
        Database["public"]["Tables"]["profiles"]["Update"]
      >,
      deletedProfileSnapshots: (checkpoint.deleted_profile_snapshots ??
        {}) as Record<string, Database["public"]["Tables"]["profiles"]["Row"]>,
      graphRollbacks: checkpoint.graph_rollbacks as unknown as RelationshipGraphRollback[],
    });
  }

  const { error } = await supabase
    .from("imports")
    .delete()
    .eq("id", importId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to cancel import: ${error.message}`);
  }
}

export type ImportBackfillSummary = {
  profilesUpdated: number;
  relationshipsUpdated: number;
  ownersAssigned: number;
  ownersUnresolved: number;
  tagsLinked: number;
  skipped: number;
};

export async function backfillImportProfiles(
  importId: string,
): Promise<ImportBackfillSummary> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();
  const importRecord = await getImportRecord(importId, orgId);

  if (importRecord.status !== "complete") {
    throw new Error("Profile data can only be backfilled from a completed import");
  }

  const [rows, orgUsers] = await Promise.all([
    loadImportRows(importId, orgId),
    loadOrgUserRecords(orgId),
  ]);

  const mapping = parseMetadata(importRecord.metadata).column_mapping ?? {};
  const headers =
    parseMetadata(importRecord.metadata).headers ?? inferHeadersFromRows(rows);
  const result: ImportBackfillSummary = {
    profilesUpdated: 0,
    relationshipsUpdated: 0,
    ownersAssigned: 0,
    ownersUnresolved: 0,
    tagsLinked: 0,
    skipped: 0,
  };

  const eligibleRows = rows.filter(
    (row) => row.dedup_status === "new" || row.dedup_status === "matched_email",
  );
  result.skipped = rows.length - eligibleRows.length;

  const partials = await runConcurrentMap(eligibleRows, 8, async (row) => {
    const normalized = normalizeRowFromImport(row.raw, headers, mapping, row.normalized);

    const profileId = await resolveProfileIdForImportRow(
      supabase,
      orgId,
      row.matched_profile_id,
      normalized,
    );

    if (!profileId) {
      return {
        profilesUpdated: 0,
        relationshipsUpdated: 0,
        ownersAssigned: 0,
        ownersUnresolved: 0,
        tagsLinked: 0,
        skipped: 1,
      };
    }

    const partial: ImportBackfillSummary = {
      profilesUpdated: 0,
      relationshipsUpdated: 0,
      ownersAssigned: 0,
      ownersUnresolved: 0,
      tagsLinked: 0,
      skipped: 0,
    };

    const profileUpdated = await backfillProfileFieldsFromNormalized(
      supabase,
      orgId,
      profileId,
      normalized,
    );
    if (profileUpdated) {
      partial.profilesUpdated = 1;
    }

    const relationshipUpdated = await backfillRelationshipFromNormalized(
      supabase,
      orgId,
      profileId,
      normalized,
    );
    if (relationshipUpdated) {
      partial.relationshipsUpdated = 1;
    }

    partial.tagsLinked = await linkProfileTagsFromNormalized(
      supabase,
      orgId,
      profileId,
      normalized,
    );

    const ownerRef = normalized.owner_email?.trim();
    if (ownerRef) {
      const ownerUserId = resolveOrgUserId(ownerRef, orgUsers);

      if (!ownerUserId) {
        partial.ownersUnresolved = 1;
      } else {
        const { data: relationship, error: relationshipError } = await supabase
          .from("relationships")
          .select("id")
          .eq("org_id", orgId)
          .eq("profile_id", profileId)
          .maybeSingle();

        if (relationshipError) {
          throw new Error(`Failed to load relationship: ${relationshipError.message}`);
        }

        if (relationship) {
          await assignOwnerFromNormalized(
            supabase,
            orgId,
            relationship.id,
            normalized,
            ownerUserId,
          );
          partial.ownersAssigned = 1;
        } else {
          partial.ownersUnresolved = 1;
        }
      }
    }

    return partial;
  });

  for (const partial of partials) {
    result.profilesUpdated += partial.profilesUpdated;
    result.relationshipsUpdated += partial.relationshipsUpdated;
    result.ownersAssigned += partial.ownersAssigned;
    result.ownersUnresolved += partial.ownersUnresolved;
    result.tagsLinked += partial.tagsLinked;
    result.skipped += partial.skipped;
  }

  const metadata = parseMetadata(importRecord.metadata);
  await supabase
    .from("imports")
    .update({
      metadata: {
        ...metadata,
        backfill_summary: result,
        owner_backfill_summary: {
          assigned: result.ownersAssigned,
          unresolved: result.ownersUnresolved,
          skipped: result.skipped,
        },
      },
    })
    .eq("id", importId)
    .eq("org_id", orgId);

  return result;
}

export async function resolveSoftMatch(
  rowId: string,
  action: SoftMatchAction,
  selectedProfileId?: string | null,
): Promise<void> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data: row, error: rowError } = await supabase
    .from("import_rows")
    .select("id, import_id, dedup_status, matched_profile_id, normalized")
    .eq("id", rowId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (rowError) {
    throw new Error(`Failed to load import row: ${rowError.message}`);
  }

  if (!row || row.dedup_status !== "soft_match") {
    throw new Error("Soft match row not found");
  }

  let update: {
    dedup_status: DedupStatus;
    matched_profile_id: string | null;
    error: string | null;
    normalized?: NormalizedImportRow;
  };

  const normalized = asNormalized(row.normalized);
  const inFileRowNumber = getInFileMatchRowNumber(normalized);
  const candidateIds = getCandidateProfileIds(normalized);

  if (action === "confirm") {
    const profileId =
      selectedProfileId?.trim() || row.matched_profile_id || candidateIds[0] || null;

    if (profileId) {
      if (
        candidateIds.length > 0 &&
        !candidateIds.includes(profileId) &&
        row.matched_profile_id !== profileId
      ) {
        throw new Error("Selected profile is not a valid candidate for this row");
      }

      update = {
        dedup_status: "matched_email",
        matched_profile_id: profileId,
        error: null,
      };
    } else if (inFileRowNumber) {
      update = {
        dedup_status: "matched_email",
        matched_profile_id: null,
        error: null,
        normalized: withMergeInFileRowNumber(normalized, inFileRowNumber),
      };
    } else {
      throw new Error("Missing matched profile for soft match row");
    }
  } else if (action === "create") {
    update = {
      dedup_status: "new",
      matched_profile_id: null,
      error: null,
    };
  } else if (action === "replace") {
    const profileId =
      selectedProfileId?.trim() || row.matched_profile_id || candidateIds[0] || null;

    if (!profileId) {
      throw new Error("Missing matched profile to replace for this row");
    }

    if (
      candidateIds.length > 0 &&
      !candidateIds.includes(profileId) &&
      row.matched_profile_id !== profileId
    ) {
      throw new Error("Selected profile is not a valid candidate for this row");
    }

    // The actual delete happens at commit time (so it can still be rolled
    // back if the commit fails) — here we just mark the row as "create a
    // fresh profile" and remember which existing profile to remove first.
    update = {
      dedup_status: "new",
      matched_profile_id: null,
      error: null,
      normalized: withReplaceProfileId(normalized, profileId),
    };
  } else {
    update = {
      dedup_status: "error",
      matched_profile_id: null,
      error: "skipped by admin",
    };
  }

  const { error } = await supabase
    .from("import_rows")
    .update(update)
    .eq("id", rowId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to resolve soft match: ${error.message}`);
  }

  const updatedRows = await loadImportRows(row.import_id, orgId);
  const importRecord = await getImportRecord(row.import_id, orgId);
  const metadata = parseMetadata(importRecord.metadata);

  await supabase
    .from("imports")
    .update({
      metadata: {
        ...metadata,
        dedup_summary: countDedupStatuses(updatedRows),
      },
    })
    .eq("id", row.import_id)
    .eq("org_id", orgId);
}

export type CommitBurstResult = {
  hasMore: boolean;
  summary: CommitSummary;
};

/**
 * Processes one bounded "burst" of rows (a handful of small batches) and
 * returns. It does NOT loop until the whole file is done — that would mean
 * one huge request running for minutes, which risks a platform timeout and
 * ties up a chunk of the database's connection pool the entire time (this
 * was the actual cause of the platform-wide slowdown during big uploads).
 * The caller (the chunk API route) is expected to call this repeatedly,
 * driven by the browser, until `hasMore` is false — the exact same pattern
 * already used for calendar sync bursts.
 */
export async function commitImport(importId: string): Promise<CommitBurstResult> {
  const user = await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();
  const importRecord = await getImportRecord(importId, orgId);
  const metadata = parseMetadata(importRecord.metadata);

  if (importRecord.status === "complete") {
    throw new Error("Import has already been completed");
  }

  if (!metadata.mapping_confirmed) {
    throw new Error("Fix the column mapping before completing this import");
  }

  if (!metadata.dedup_summary) {
    throw new Error("Still checking for duplicates — try again in a moment");
  }

  const rows = await loadImportRows(importId, orgId);
  const unresolved = rows.filter((row) => row.dedup_status === "soft_match").length;

  if (unresolved > 0) {
    throw new Error("Resolve all rows under \"Needs your review\" before completing");
  }

  const pendingCount = rows.filter((row) => row.dedup_status === "pending").length;
  if (pendingCount > 0) {
    throw new Error(
      `Still checking for duplicates (${pendingCount} row${pendingCount === 1 ? "" : "s"} pending) — try again in a moment`,
    );
  }

  const commitRows = rows.filter(
    (row) => row.dedup_status === "matched_email" || row.dedup_status === "new",
  );

  if (commitRows.length === 0) {
    const errorCount = rows.filter((row) => row.dedup_status === "error").length;
    throw new Error(
      errorCount > 0
        ? `No rows are ready. ${errorCount} row${errorCount === 1 ? "" : "s"} have errors — check that Full name (or First name + Last name) is mapped, using "Fix column mapping".`
        : "No rows are ready to complete.",
    );
  }

  const { data: orgUsers, error: usersError } = await supabase
    .from("users")
    .select("id, email, full_name")
    .eq("org_id", orgId);

  if (usersError) {
    throw new Error(`Failed to load org users: ${usersError.message}`);
  }

  const orgUserRecords: OrgUserRecord[] = (orgUsers ?? []).map((user) => ({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
  }));

  const COMMIT_ROWS_PER_CHUNK = 150;
  // How many small (6-row) batches to process before returning control to
  // the caller for this burst — roughly 48 rows per server round-trip, kept
  // deliberately small so a single call always finishes in a few seconds
  // regardless of how large the whole file is.
  const COMMIT_BURST_BATCHES = 8;
  const isResume =
    importRecord.status === "processing" && Boolean(metadata.commit_checkpoint);

  const sourceLabel = `${importRecord.source} import ${new Date(importRecord.created_at).toLocaleDateString("en-GB")}`;
  const mapping = metadata.column_mapping ?? {};
  const headers = metadata.headers ?? inferHeadersFromRows(rows);
  const event = importRecord.events
    ? {
        id: importRecord.events.id,
        title: importRecord.events.title,
        event_date: importRecord.events.event_date,
      }
    : null;

  const skippedCount = rows.length - commitRows.length;
  let summary: CommitSummary;
  const createdProfileIds: string[] = [];
  const updatedProfileSnapshots = new Map<
    string,
    Database["public"]["Tables"]["profiles"]["Update"]
  >();
  const graphRollbacks: RelationshipGraphRollback[] = [];
  const deletedProfileSnapshots = new Map<
    string,
    Database["public"]["Tables"]["profiles"]["Row"]
  >();
  const profileIdByRowNumber = new Map<number, string>();
  let startIndex = 0;

  if (isResume && metadata.commit_checkpoint) {
    const checkpoint = metadata.commit_checkpoint;
    startIndex = checkpoint.next_row_index;
    summary = { ...checkpoint.partial_summary };
    createdProfileIds.push(...checkpoint.created_profile_ids);
    for (const [profileId, snapshot] of Object.entries(
      checkpoint.updated_profile_snapshots,
    )) {
      updatedProfileSnapshots.set(
        profileId,
        snapshot as Database["public"]["Tables"]["profiles"]["Update"],
      );
    }
    for (const [profileId, snapshot] of Object.entries(
      checkpoint.deleted_profile_snapshots ?? {},
    )) {
      deletedProfileSnapshots.set(
        profileId,
        snapshot as Database["public"]["Tables"]["profiles"]["Row"],
      );
    }
    graphRollbacks.push(
      ...(checkpoint.graph_rollbacks as RelationshipGraphRollback[]),
    );
    for (const [rowNumber, profileId] of Object.entries(
      checkpoint.profile_id_by_row_number,
    )) {
      profileIdByRowNumber.set(Number(rowNumber), profileId);
    }
  } else {
    summary = {
      created: 0,
      updated: 0,
      skipped: skippedCount,
      ownerWarnings: 0,
    };

    const { error: processingError } = await supabase
      .from("imports")
      .update({
        status: "processing",
        metadata: {
          ...metadata,
          commit_checkpoint: undefined,
          errors: undefined,
        },
      })
      .eq("id", importId)
      .eq("org_id", orgId);

    if (processingError) {
      throw new Error(`Failed to mark import as processing: ${processingError.message}`);
    }
  }

  const sortedCommitRows = [...commitRows].sort(
    (left, right) => left.row_number - right.row_number,
  );

  type ImportCommitRow = (typeof sortedCommitRows)[number];

  async function flushMatchedBatch(batch: ImportCommitRow[]) {
    if (batch.length === 0) {
      return;
    }

    // Same reasoning as flushNewBatch: record each row's outcome the
    // instant it succeeds, so a sibling row failing later in this batch
    // can't leave an earlier row's changes untracked for rollback.
    await runConcurrentMap(batch, 6, async (row) => {
      const normalized = normalizeRowFromImport(
        row.raw,
        headers,
        mapping,
        row.normalized,
      );

      // Same as above: the in-file-duplicate marker only survives on the
      // row's stored normalized data, not on a fresh recompute.
      const profileId =
        row.matched_profile_id ??
        profileIdByRowNumber.get(
          getInFileMatchRowNumber(asNormalized(row.normalized)) ?? -1,
        );

      if (!profileId) {
        throw new Error(
          `Could not resolve profile for import row ${row.row_number}`,
        );
      }

      const { ownerWarnings, profileSnapshot, graphRollback } =
        await updateProfileFromImportRow({
          orgId,
          importId,
          userId: user.id,
          profileId,
          normalized,
          sourceLabel,
          orgUsers: orgUserRecords,
          event,
        });

      if (profileSnapshot) {
        updatedProfileSnapshots.set(profileId, profileSnapshot);
      }
      if (graphRollback) {
        graphRollbacks.push(graphRollback);
      }
      summary.updated += 1;
      summary.ownerWarnings += ownerWarnings;
    });
  }

  async function flushNewBatch(batch: ImportCommitRow[]) {
    if (batch.length === 0) {
      return;
    }

    // Every side effect below is recorded the instant it succeeds, rather
    // than being collected and applied after the whole batch resolves. If a
    // sibling row in this same batch fails partway through, the profiles
    // this batch already created are still tracked and can still be rolled
    // back — none of them are left orphaned.
    await runConcurrentMap(batch, 6, async (row) => {
      const normalized = normalizeRowFromImport(
        row.raw,
        headers,
        mapping,
        row.normalized,
      );

      // Same as flushMatchedBatch: dedup markers only survive on the row's
      // stored normalized data, not on a fresh recompute.
      const replaceProfileId = getReplaceProfileId(asNormalized(row.normalized));
      if (replaceProfileId && !deletedProfileSnapshots.has(replaceProfileId)) {
        const { data: existingProfile, error: existingProfileError } =
          await supabase
            .from("profiles")
            .select("*")
            .eq("id", replaceProfileId)
            .eq("org_id", orgId)
            .maybeSingle();

        if (existingProfileError) {
          throw new Error(
            `Failed to load profile to replace: ${existingProfileError.message}`,
          );
        }

        if (existingProfile) {
          deletedProfileSnapshots.set(replaceProfileId, existingProfile);
          await deleteProfile(replaceProfileId);
        }
      }

      const result = await createProfileFromImportRow({
        orgId,
        importId,
        userId: user.id,
        normalized,
        sourceLabel,
        orgUsers: orgUserRecords,
        event,
      });

      if (result.outcome === "skipped_race") {
        profileIdByRowNumber.set(row.row_number, result.existingProfileId);
        summary.skipped += 1;
        return;
      }

      profileIdByRowNumber.set(row.row_number, result.profileId);
      createdProfileIds.push(result.profileId);
      summary.created += 1;
      summary.ownerWarnings += result.ownerWarnings;
    });
  }

  async function persistCheckpoint(nextRowIndex: number) {
    const checkpoint: ImportCommitCheckpoint = {
      next_row_index: nextRowIndex,
      created_profile_ids: [...createdProfileIds],
      updated_profile_snapshots: Object.fromEntries(
        [...updatedProfileSnapshots.entries()].map(([profileId, snapshot]) => [
          profileId,
          snapshot as Json,
        ]),
      ),
      deleted_profile_snapshots: Object.fromEntries(
        [...deletedProfileSnapshots.entries()].map(([profileId, snapshot]) => [
          profileId,
          snapshot as unknown as Json,
        ]),
      ),
      graph_rollbacks: graphRollbacks as unknown as Json,
      partial_summary: { ...summary },
      profile_id_by_row_number: Object.fromEntries(
        [...profileIdByRowNumber.entries()].map(([rowNumber, profileId]) => [
          String(rowNumber),
          profileId,
        ]),
      ),
    };

    const { error: checkpointError } = await supabase
      .from("imports")
      .update({
        metadata: {
          ...metadata,
          commit_checkpoint: checkpoint,
        },
      })
      .eq("id", importId)
      .eq("org_id", orgId);

    if (checkpointError) {
      throw new Error(`Failed to save import checkpoint: ${checkpointError.message}`);
    }
  }

  async function checkpointAndCheckCancelled(nextRowIndex: number) {
    await persistCheckpoint(nextRowIndex);

    if (nextRowIndex >= sortedCommitRows.length) {
      return;
    }

    // Cooperative cancellation: if an admin cancelled this import while we
    // were mid-flight, the row is now gone — stop here rather than keep
    // writing. The catch block below undoes everything committed so far.
    // Checked after every small batch (not just every 150 rows) so a
    // cancel takes effect quickly even on imports far smaller than one
    // full chunk.
    const { data: stillExists } = await supabase
      .from("imports")
      .select("id")
      .eq("id", importId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (!stillExists) {
      throw new Error("Import was cancelled");
    }
  }

  try {
    if (!isResume) {
      await persistCheckpoint(0);
    }

    let batchesThisBurst = 0;
    let burstLimitReached = false;

    outer: while (startIndex < sortedCommitRows.length) {
      const endIndex = Math.min(
        startIndex + COMMIT_ROWS_PER_CHUNK,
        sortedCommitRows.length,
      );
      const chunk = sortedCommitRows.slice(startIndex, endIndex);
      let matchedBatch: ImportCommitRow[] = [];
      let newBatch: ImportCommitRow[] = [];

      for (let chunkOffset = 0; chunkOffset < chunk.length; chunkOffset += 1) {
        const row = chunk[chunkOffset];

        if (row.dedup_status === "new") {
          // A row can only merge into an earlier in-file row (never a later
          // one), so any "new" rows queued up here are safe to create
          // together — flush the other kind first so row-number ordering
          // (and profileIdByRowNumber) stays correct for whichever comes
          // next.
          await flushMatchedBatch(matchedBatch);
          matchedBatch = [];

          newBatch.push(row);
          if (newBatch.length >= 6) {
            await flushNewBatch(newBatch);
            newBatch = [];
            await checkpointAndCheckCancelled(startIndex + chunkOffset + 1);
            batchesThisBurst += 1;
            if (batchesThisBurst >= COMMIT_BURST_BATCHES) {
              burstLimitReached = true;
              break outer;
            }
          }
        } else {
          await flushNewBatch(newBatch);
          newBatch = [];

          matchedBatch.push(row);
          if (matchedBatch.length >= 6) {
            await flushMatchedBatch(matchedBatch);
            matchedBatch = [];
            await checkpointAndCheckCancelled(startIndex + chunkOffset + 1);
            batchesThisBurst += 1;
            if (batchesThisBurst >= COMMIT_BURST_BATCHES) {
              burstLimitReached = true;
              break outer;
            }
          }
        }
      }

      await flushNewBatch(newBatch);
      await flushMatchedBatch(matchedBatch);
      startIndex = endIndex;

      if (startIndex < sortedCommitRows.length) {
        await checkpointAndCheckCancelled(startIndex);
      }
    }

    if (burstLimitReached) {
      // Stop here and hand control back to the caller — the trailing rows
      // of whatever batch we stopped mid-chunk on haven't been flushed, but
      // that's fine: the checkpoint's next_row_index already points right
      // after the last batch we did flush, so the next burst picks up
      // exactly there.
      return { hasMore: true, summary: { ...summary } };
    }

    if (event) {
      try {
        await inferCoAttendanceForEvent(event.id);
      } catch {
        // Co-attendance inference is best-effort, same as the manual add-attendee flow.
      }
    }

    const { error: completeError } = await supabase
      .from("imports")
      .update({
        status: "complete",
        metadata: {
          ...metadata,
          commit_checkpoint: undefined,
          commit_summary: summary,
          committed_at: new Date().toISOString(),
        },
      })
      .eq("id", importId)
      .eq("org_id", orgId);

    if (completeError) {
      throw new Error(completeError.message);
    }

    return { hasMore: false, summary };
  } catch (error) {
    await rollbackImportCommitProgress(supabase, orgId, {
      createdProfileIds,
      updatedProfileSnapshots: Object.fromEntries(updatedProfileSnapshots),
      deletedProfileSnapshots: Object.fromEntries(deletedProfileSnapshots),
      graphRollbacks,
    });

    await supabase
      .from("imports")
      .update({
        status: "failed",
        metadata: {
          ...metadata,
          commit_checkpoint: undefined,
          errors: [
            error instanceof Error ? error.message : "Commit failed unexpectedly",
          ],
        },
      })
      .eq("id", importId)
      .eq("org_id", orgId);

    throw error;
  }
}

export async function attachImportToEvent(
  importId: string,
  eventId: string,
): Promise<void> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (eventError) {
    throw new Error(`Failed to verify event: ${eventError.message}`);
  }

  if (!event) {
    throw new Error("Event not found");
  }

  const { error } = await supabase
    .from("imports")
    .update({ event_id: eventId })
    .eq("id", importId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to attach import to event: ${error.message}`);
  }
}

export type ImportProgress = {
  status: ImportStatus;
  processedRows: number;
  totalRows: number;
  summary: CommitSummary | null;
};

export async function getImportProgress(importId: string): Promise<ImportProgress> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();
  const importRecord = await getImportRecord(importId, orgId);
  const metadata = parseMetadata(importRecord.metadata);
  const checkpoint = metadata.commit_checkpoint;

  const { count, error } = await supabase
    .from("import_rows")
    .select("id", { count: "exact", head: true })
    .eq("import_id", importId)
    .in("dedup_status", ["new", "matched_email"]);

  if (error) {
    throw new Error(`Failed to load import progress: ${error.message}`);
  }

  const totalRows = count ?? 0;
  const processedRows = checkpoint
    ? checkpoint.next_row_index
    : importRecord.status === "complete"
      ? totalRows
      : 0;

  return {
    status: importRecord.status,
    processedRows,
    totalRows,
    summary: checkpoint?.partial_summary ?? metadata.commit_summary ?? null,
  };
}

export async function reopenImport(importId: string): Promise<void> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();
  const importRecord = await getImportRecord(importId, orgId);
  const metadata = parseMetadata(importRecord.metadata);
  const commitSummary = metadata.commit_summary;

  if (importRecord.status !== "complete") {
    throw new Error("Only completed imports can be reopened");
  }

  if (
    !commitSummary ||
    commitSummary.created + commitSummary.updated > 0
  ) {
    throw new Error("Only imports that wrote no profiles can be reopened");
  }

  const { error } = await supabase
    .from("imports")
    .update({
      status: "processing",
      metadata: {
        ...metadata,
        commit_summary: undefined,
        committed_at: undefined,
        dedup_summary: undefined,
        errors: undefined,
      },
    })
    .eq("id", importId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to reopen import: ${error.message}`);
  }
}

type ImportEventContext = {
  id: string;
  title: string;
  event_date: string;
} | null;

type CommitContext = {
  orgId: string;
  importId: string;
  userId: string;
  normalized: NormalizedImportRow;
  sourceLabel: string;
  orgUsers: OrgUserRecord[];
  event: ImportEventContext;
};

async function createProfileFromImportRow(
  context: CommitContext,
): Promise<
  | { outcome: "created"; profileId: string; ownerWarnings: number }
  | { outcome: "skipped_race"; existingProfileId: string }
> {
  const supabase = await createClient();
  const { orgId, normalized, importId, userId, sourceLabel, orgUsers, event } =
    context;

  const organisationName = normalized.organisation_name?.trim() || null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      org_id: orgId,
      full_name: normalized.full_name!.trim(),
      email: normalized.email ?? null,
      phone: normalized.phone ?? null,
      linkedin_url: normalized.linkedin_url ?? null,
      organisation_name: organisationName,
      organisation_name_normalised: normaliseOrganisationName(organisationName),
      occupation: normalized.occupation ?? null,
      location_city: normalized.location_city ?? null,
      location_country: normalized.location_country ?? null,
      source: "csv",
      extended: normalized.extended ?? {},
    })
    .select("id")
    .single();

  if (profileError) {
    // Rows are committed in concurrent batches, so another row (or another
    // import committing at the same time) can create a profile with this
    // exact email a moment earlier. Treat that the same way we already
    // treat a duplicate email within one file: skip this row rather than
    // failing the whole commit.
    if (profileError.code === "23505" && normalized.email) {
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("org_id", orgId)
        .ilike("email", normalized.email)
        .maybeSingle();

      if (existing) {
        return { outcome: "skipped_race", existingProfileId: existing.id };
      }
    }

    throw new Error(`Failed to create profile: ${profileError.message}`);
  }

  const { ownerWarnings } = await ensureRelationshipGraph({
    orgId,
    profileId: profile.id,
    importId,
    userId,
    normalized,
    sourceLabel,
    orgUsers,
    event,
  });

  // Imported profiles never went through createProfile/updateProfile (this
  // writes the row directly), so without this they'd never get AI-tagged
  // at all — the only path that tags a profile was previously a human
  // editing it by hand in the UI. Scheduled after the response is sent, via
  // Next's after(), so committing an import row isn't slowed down waiting
  // on an AI call; enrichAndTagProfile never throws.
  if (normalized.occupation?.trim() || organisationName) {
    after(() => enrichAndTagProfile(supabase, profile.id, orgId));
  }

  return { outcome: "created", profileId: profile.id, ownerWarnings };
}

async function updateProfileFromImportRow(
  context: CommitContext & { profileId: string },
): Promise<{
  ownerWarnings: number;
  profileSnapshot?: Database["public"]["Tables"]["profiles"]["Update"];
  graphRollback?: RelationshipGraphRollback;
}> {
  const supabase = await createClient();
  const { orgId, profileId, normalized } = context;

  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select(
      "email, phone, linkedin_url, organisation_name, organisation_name_normalised, occupation, location_city, location_country, extended",
    )
    .eq("id", profileId)
    .eq("org_id", orgId)
    .single();

  if (existingError) {
    throw new Error(`Failed to load existing profile: ${existingError.message}`);
  }

  const update: Database["public"]["Tables"]["profiles"]["Update"] = {};
  const fillIfEmpty = (
    field:
      | "email"
      | "phone"
      | "linkedin_url"
      | "organisation_name"
      | "occupation"
      | "location_city"
      | "location_country",
    value: string | undefined,
  ) => {
    const current = existing[field];
    const incoming = value?.trim();

    if (!current && incoming) {
      update[field] = incoming;
    }
  };

  fillIfEmpty("email", normalized.email);
  fillIfEmpty("phone", normalized.phone);
  fillIfEmpty("linkedin_url", normalized.linkedin_url);
  fillIfEmpty("organisation_name", normalized.organisation_name);
  fillIfEmpty("occupation", normalized.occupation);
  fillIfEmpty("location_city", normalized.location_city);
  fillIfEmpty("location_country", normalized.location_country);

  if (update.organisation_name) {
    update.organisation_name_normalised = normaliseOrganisationName(
      update.organisation_name,
    );
  }

  const mergedExtended = {
    ...(typeof existing.extended === "object" && existing.extended
      ? (existing.extended as Record<string, string>)
      : {}),
    ...(normalized.extended ?? {}),
  };

  if (Object.keys(mergedExtended).length > 0) {
    update.extended = mergedExtended;
  }

  if (Object.keys(update).length > 0) {
    const profileSnapshot: Database["public"]["Tables"]["profiles"]["Update"] = {
      email: existing.email,
      phone: existing.phone,
      linkedin_url: existing.linkedin_url,
      organisation_name: existing.organisation_name,
      organisation_name_normalised: existing.organisation_name_normalised,
      occupation: existing.occupation,
      location_city: existing.location_city,
      location_country: existing.location_country,
      extended: existing.extended,
    };

    const { error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", profileId)
      .eq("org_id", orgId);

    if (error) {
      throw new Error(`Failed to update profile: ${error.message}`);
    }

    // Same background re-tagging as createProfileFromImportRow above —
    // only worth it when occupation/company (the fields enrichment
    // actually reasons about) were part of this update. enrichAndTagProfile
    // re-checks the source hash itself either way, so this is just to
    // avoid a pointless call when e.g. only phone/linkedin_url got filled.
    if (update.occupation || update.organisation_name) {
      after(() => enrichAndTagProfile(supabase, profileId, orgId));
    }

    const { ownerWarnings, graphRollback } = await ensureRelationshipGraph({
      ...context,
      profileId,
    });

    return { ownerWarnings, profileSnapshot, graphRollback };
  }

  const { ownerWarnings, graphRollback } = await ensureRelationshipGraph({
    ...context,
    profileId,
  });

  return { ownerWarnings, graphRollback };
}

async function ensureRelationshipGraph(input: {
  orgId: string;
  profileId: string;
  importId: string;
  userId: string;
  normalized: NormalizedImportRow;
  sourceLabel: string;
  orgUsers: OrgUserRecord[];
  event: ImportEventContext;
}): Promise<{
  ownerWarnings: number;
  graphRollback?: RelationshipGraphRollback;
}> {
  const supabase = await createClient();
  const {
    orgId,
    profileId,
    importId,
    userId,
    normalized,
    sourceLabel,
    orgUsers,
    event,
  } = input;
  let ownerWarnings = 0;
  const graphRollback: RelationshipGraphRollback = {
    relationshipId: "",
    ownersModified: false,
    relationshipOwnersBefore: [],
    linkedProfileTags: [],
    createdTagIds: [],
    createdEventAttendeeKeys: [],
  };
  let trackedRollback = false;

  const relationshipStatus = (normalized.relationship_status ??
    "prospect") as RelationshipStatus;
  const relationshipType = (normalized.relationship_type ??
    "other") as RelationshipType;

  const { data: existingRelationship, error: relationshipLookupError } = await supabase
    .from("relationships")
    .select("id, status, relationship_type")
    .eq("profile_id", profileId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (relationshipLookupError) {
    throw new Error(`Failed to load relationship: ${relationshipLookupError.message}`);
  }

  let relationshipId = existingRelationship?.id;

  if (!relationshipId) {
    const { data: createdRelationship, error: createRelationshipError } = await supabase
      .from("relationships")
      .insert({
        org_id: orgId,
        profile_id: profileId,
        status: relationshipStatus,
        relationship_type: relationshipType,
      })
      .select("id")
      .single();

    if (createRelationshipError) {
      throw new Error(
        `Failed to create relationship: ${createRelationshipError.message}`,
      );
    }

    relationshipId = createdRelationship.id;
    graphRollback.createdRelationshipId = createdRelationship.id;
    trackedRollback = true;
  }

  graphRollback.relationshipId = relationshipId;

  const { data: existingSource, error: sourceLookupError } = await supabase
    .from("relationship_sources")
    .select("id")
    .eq("relationship_id", relationshipId)
    .eq("source_type", "csv_import")
    .eq("source_id", importId)
    .maybeSingle();

  if (sourceLookupError) {
    throw new Error(`Failed to check relationship source: ${sourceLookupError.message}`);
  }

  if (!existingSource) {
    const { data: createdSource, error: sourceError } = await supabase
      .from("relationship_sources")
      .insert({
        org_id: orgId,
        relationship_id: relationshipId,
        source_type: "csv_import",
        source_id: importId,
        source_label: sourceLabel,
        created_by: userId,
      })
      .select("id")
      .single();

    if (sourceError) {
      throw new Error(`Failed to create relationship source: ${sourceError.message}`);
    }

    graphRollback.createdRelationshipSourceId = createdSource.id;
    trackedRollback = true;
  }

  const ownerRef = normalized.owner_email?.trim();
  if (ownerRef) {
    const ownerUserId = resolveOrgUserId(ownerRef, orgUsers);

    if (!ownerUserId) {
      ownerWarnings += 1;
    } else {
      const ownerStrength = (normalized.owner_strength ?? "unknown") as OwnerStrength;

      const { data: ownersBefore, error: ownersBeforeError } = await supabase
        .from("relationship_owners")
        .select("user_id, strength, is_primary, notes, last_interaction_at")
        .eq("relationship_id", relationshipId)
        .eq("org_id", orgId);

      if (ownersBeforeError) {
        throw new Error(`Failed to load relationship owners: ${ownersBeforeError.message}`);
      }

      graphRollback.relationshipOwnersBefore = (ownersBefore ??
        []) as RelationshipOwnerSnapshot[];
      graphRollback.ownersModified = true;
      trackedRollback = true;

      await supabase
        .from("relationship_owners")
        .update({ is_primary: false })
        .eq("relationship_id", relationshipId)
        .eq("org_id", orgId);

      const { error: ownerError } = await supabase.from("relationship_owners").upsert(
        {
          org_id: orgId,
          relationship_id: relationshipId,
          user_id: ownerUserId,
          strength: ownerStrength,
          is_primary: true,
        },
        { onConflict: "relationship_id,user_id" },
      );

      if (ownerError) {
        throw new Error(`Failed to assign owner: ${ownerError.message}`);
      }
    }
  }

  type TagCategory = Database["public"]["Tables"]["tags"]["Row"]["category"];

  async function findOrCreateTagAndLink(tagName: string, category: TagCategory) {
    const { data: tag, error: tagLookupError } = await supabase
      .from("tags")
      .select("id")
      .eq("org_id", orgId)
      .eq("name", tagName)
      .maybeSingle();

    if (tagLookupError) {
      throw new Error(`Failed to look up tag: ${tagLookupError.message}`);
    }

    let tagId = tag?.id;
    let createdTag = false;

    if (!tagId) {
      const { data: createdTagRow, error: createTagError } = await supabase
        .from("tags")
        .insert({
          org_id: orgId,
          name: tagName,
          category,
        })
        .select("id")
        .single();

      if (createTagError) {
        // Rows are committed in concurrent batches, so another row can
        // create the same-named tag a moment earlier — that's not a real
        // failure, just re-use the tag it created instead of throwing.
        if (createTagError.code === "23505") {
          const { data: raceTag, error: raceTagError } = await supabase
            .from("tags")
            .select("id")
            .eq("org_id", orgId)
            .eq("name", tagName)
            .maybeSingle();

          if (raceTagError || !raceTag) {
            throw new Error(`Failed to create tag: ${createTagError.message}`);
          }

          tagId = raceTag.id;
        } else {
          throw new Error(`Failed to create tag: ${createTagError.message}`);
        }
      } else {
        tagId = createdTagRow.id;
        createdTag = true;
        graphRollback.createdTagIds.push(tagId);
        trackedRollback = true;
      }
    }

    const { data: existingProfileTag, error: existingProfileTagError } =
      await supabase
        .from("profile_tags")
        .select("id")
        .eq("org_id", orgId)
        .eq("profile_id", profileId)
        .eq("tag_id", tagId)
        .maybeSingle();

    if (existingProfileTagError) {
      throw new Error(`Failed to check profile tag: ${existingProfileTagError.message}`);
    }

    if (!existingProfileTag) {
      const { error: profileTagError } = await supabase.from("profile_tags").insert({
        org_id: orgId,
        profile_id: profileId,
        tag_id: tagId,
      });

      if (profileTagError) {
        if (createdTag) {
          graphRollback.createdTagIds.pop();
        }
        throw new Error(`Failed to link tag: ${profileTagError.message}`);
      }

      graphRollback.linkedProfileTags.push({ profileId, tagId });
      trackedRollback = true;
    }
  }

  const tagNames = parseTags(normalized.tags);
  for (const tagName of tagNames) {
    await findOrCreateTagAndLink(tagName, "expertise");
  }

  if (event) {
    const { data: existingAttendee, error: attendeeLookupError } = await supabase
      .from("event_attendees")
      .select("id")
      .eq("org_id", orgId)
      .eq("event_id", event.id)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (attendeeLookupError) {
      throw new Error(`Failed to check event attendee: ${attendeeLookupError.message}`);
    }

    if (!existingAttendee) {
      const { error: attendeeError } = await supabase.from("event_attendees").insert({
        org_id: orgId,
        event_id: event.id,
        profile_id: profileId,
        attended: true,
      });

      if (attendeeError) {
        throw new Error(`Failed to add event attendee: ${attendeeError.message}`);
      }

      graphRollback.createdEventAttendeeKeys.push({
        eventId: event.id,
        profileId,
      });
      trackedRollback = true;
    }

    await ensureEventAttendanceEvidence(orgId, event, profileId, userId);
    await findOrCreateTagAndLink(event.title, "events");
  }

  return {
    ownerWarnings,
    graphRollback: trackedRollback ? graphRollback : undefined,
  };
}

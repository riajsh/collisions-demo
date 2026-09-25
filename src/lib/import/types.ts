import type { Database } from "@/types/database";
import type { Json } from "@/types/database";

import type { EcosystemFieldKey } from "./constants";

export type ImportStatus = Database["public"]["Enums"]["import_status"];
export type DedupStatus = Database["public"]["Enums"]["dedup_status"];

export type ColumnMapping = Record<string, EcosystemFieldKey | "">;

export type DedupSummary = {
  matched_email: number;
  soft_match: number;
  new: number;
  error: number;
};

export type CommitSummary = {
  created: number;
  updated: number;
  skipped: number;
  ownerWarnings: number;
};

export type SoftMatchAction = "confirm" | "create" | "skip" | "replace";

export type ImportCommitCheckpoint = {
  next_row_index: number;
  created_profile_ids: string[];
  updated_profile_snapshots: Record<string, Json>;
  /** Full row of any profile deleted for a "replace" row, so it can be
   * restored if the commit ultimately fails. Optional for backwards
   * compatibility with checkpoints saved before this existed. */
  deleted_profile_snapshots?: Record<string, Json>;
  graph_rollbacks: Json;
  partial_summary: CommitSummary;
  profile_id_by_row_number: Record<string, string>;
};

export type ImportMetadata = {
  headers?: string[];
  column_mapping?: ColumnMapping;
  mapping_confirmed?: boolean;
  dedup_summary?: DedupSummary;
  commit_summary?: CommitSummary;
  commit_checkpoint?: ImportCommitCheckpoint;
  storage_path?: string;
  storage_warning?: string;
  errors?: string[];
  owner_backfill_summary?: {
    assigned: number;
    unresolved: number;
    skipped: number;
  };
  backfill_summary?: {
    profilesUpdated: number;
    relationshipsUpdated: number;
    ownersAssigned: number;
    ownersUnresolved: number;
    tagsLinked: number;
    skipped: number;
  };
};

export type NormalizedImportRow = {
  full_name?: string;
  email?: string;
  organisation_name?: string;
  phone?: string;
  linkedin_url?: string;
  occupation?: string;
  location_city?: string;
  location_country?: string;
  relationship_status?: string;
  relationship_type?: string;
  owner_email?: string;
  owner_strength?: string;
  tags?: string;
  extended?: Record<string, string>;
  _dedup_in_file_row_number?: number;
  _dedup_merge_in_file_row_number?: number;
  _dedup_candidate_profile_ids?: string[];
  _dedup_replace_profile_id?: string;
};

export type ImportListItem = {
  id: string;
  filename: string;
  source: string;
  rowCount: number;
  status: ImportStatus;
  createdAt: string;
  createdByName: string;
  statusHint: string;
  canDelete: boolean;
  dedupSummary: DedupSummary | null;
  commitSummary: CommitSummary | null;
};

export type ImportRowView = {
  id: string;
  rowNumber: number;
  raw: Record<string, string>;
  normalized: NormalizedImportRow;
  dedupStatus: DedupStatus;
  matchedProfileId: string | null;
  matchedProfileName: string | null;
  matchedProfileCompany: string | null;
  matchedInFileRowNumber: number | null;
  matchedInFileRowEmail: string | null;
  matchedProfileCandidates: Array<{
    id: string;
    fullName: string;
    organisationName: string | null;
    email: string | null;
  }>;
  error: string | null;
};

export type ImportDetail = {
  id: string;
  filename: string;
  source: string;
  rowCount: number;
  status: ImportStatus;
  createdAt: string;
  createdByName: string;
  metadata: ImportMetadata;
  headers: string[];
  previewRows: ImportRowView[];
  softMatchRows: ImportRowView[];
  errorRows: ImportRowView[];
  mappingNeedsAttention: boolean;
  dedupSummary: DedupSummary | null;
  commitSummary: CommitSummary | null;
  unresolvedSoftMatches: number;
  committableRowCount: number;
  pendingRowCount: number;
  statusHint: string;
  canDelete: boolean;
  canCommit: boolean;
  /** True once "Complete import" has been clicked at least once — cancelling
   * from this point undoes whatever it already wrote before removing it. */
  hasCommitProgress: boolean;
  eventId: string | null;
  eventTitle: string | null;
};

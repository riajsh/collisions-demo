import {
  ECOSYSTEM_FIELDS,
  guessColumnMapping,
  OWNER_STRENGTHS,
  RELATIONSHIP_STATUSES,
  RELATIONSHIP_TYPES,
  type EcosystemFieldKey,
} from "./constants";
import { normalisePersonName } from "@/lib/normalise/person-name";
import type { ColumnMapping, NormalizedImportRow } from "./types";

/** Saved admin mappings override auto-detected ones; empty saves keep auto-detect. */
export function buildEffectiveColumnMapping(
  headers: string[],
  savedMapping: ColumnMapping,
): ColumnMapping {
  const effective = guessColumnMapping(headers);

  for (const [header, field] of Object.entries(savedMapping)) {
    if (field) {
      effective[header] = field;
    }
  }

  return effective;
}

export function normalizeRowFromImport(
  raw: Record<string, string>,
  headers: string[],
  savedMapping: ColumnMapping,
  fallbackNormalized: NormalizedImportRow,
): NormalizedImportRow {
  if (headers.length === 0) {
    return fallbackNormalized;
  }

  return applyColumnMapping(raw, buildEffectiveColumnMapping(headers, savedMapping));
}

const FIRST_NAME_HEADERS = [
  "first name",
  "firstname",
  "first_name",
  "given name",
  "forename",
];
const LAST_NAME_HEADERS = [
  "last name",
  "lastname",
  "last_name",
  "surname",
  "family name",
];

function normaliseHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function findRawValue(
  raw: Record<string, string>,
  candidates: string[],
): string | undefined {
  for (const [column, value] of Object.entries(raw)) {
    const key = normaliseHeaderKey(column);
    if (candidates.includes(key)) {
      const cleaned = value?.trim();
      if (cleaned) {
        return cleaned;
      }
    }
  }

  return undefined;
}

function deriveFullName(
  raw: Record<string, string>,
  normalized: NormalizedImportRow,
): void {
  if (cleanValue(normalized.full_name)) {
    return;
  }

  const firstName = findRawValue(raw, FIRST_NAME_HEADERS);
  const lastName = findRawValue(raw, LAST_NAME_HEADERS);

  if (firstName || lastName) {
    normalized.full_name = [firstName, lastName].filter(Boolean).join(" ");
  }
}

function normaliseEnumToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

const OWNER_STRENGTH_ALIASES: Record<string, (typeof OWNER_STRENGTHS)[number]> = {
  champion: "strong",
  hot: "strong",
  cold: "weak",
  inner_circle: "inner_circle",
  "inner circle": "inner_circle",
};

function normalizeOwnerStrength(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const token = normaliseEnumToken(value);
  if (OWNER_STRENGTHS.includes(token as (typeof OWNER_STRENGTHS)[number])) {
    return token;
  }

  return OWNER_STRENGTH_ALIASES[token] ?? token;
}

function normalizeImportEnums(normalized: NormalizedImportRow): void {
  if (normalized.relationship_status) {
    normalized.relationship_status = normaliseEnumToken(normalized.relationship_status);
  }

  if (normalized.relationship_type) {
    const typeToken = normaliseEnumToken(normalized.relationship_type);

    if (RELATIONSHIP_TYPES.includes(typeToken as (typeof RELATIONSHIP_TYPES)[number])) {
      normalized.relationship_type = typeToken;
    } else if (
      RELATIONSHIP_STATUSES.includes(
        typeToken as (typeof RELATIONSHIP_STATUSES)[number],
      )
    ) {
      // Some exports put status values in a "Relationship Type" column.
      if (!normalized.relationship_status) {
        normalized.relationship_status = typeToken;
      }
      delete normalized.relationship_type;
    } else {
      delete normalized.relationship_type;
    }
  }

  if (
    normalized.relationship_status &&
    !RELATIONSHIP_STATUSES.includes(
      normalized.relationship_status as (typeof RELATIONSHIP_STATUSES)[number],
    )
  ) {
    delete normalized.relationship_status;
  }

  if (normalized.owner_strength) {
    normalized.owner_strength = normalizeOwnerStrength(normalized.owner_strength);
    if (
      !OWNER_STRENGTHS.includes(
        normalized.owner_strength as (typeof OWNER_STRENGTHS)[number],
      )
    ) {
      delete normalized.owner_strength;
    }
  }
}

function cleanValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isEcosystemField(value: string): value is EcosystemFieldKey {
  return ECOSYSTEM_FIELDS.some((field) => field.key === value);
}

export function applyColumnMapping(
  raw: Record<string, string>,
  mapping: ColumnMapping,
): NormalizedImportRow {
  const normalized: NormalizedImportRow = { extended: {} };
  const mappedColumns = new Set<string>();
  let mappedFirstName: string | undefined;
  let mappedLastName: string | undefined;

  for (const [csvColumn, ecosystemField] of Object.entries(mapping)) {
    if (!ecosystemField || !isEcosystemField(ecosystemField)) {
      continue;
    }

    const value = cleanValue(raw[csvColumn]);
    mappedColumns.add(csvColumn);

    if (!value) {
      continue;
    }

    if (ecosystemField === "email") {
      normalized.email = value.toLowerCase();
      continue;
    }

    if (ecosystemField === "first_name") {
      mappedFirstName = value;
      continue;
    }

    if (ecosystemField === "last_name") {
      mappedLastName = value;
      continue;
    }

    normalized[ecosystemField] = value;
  }

  for (const [column, value] of Object.entries(raw)) {
    if (mappedColumns.has(column)) {
      continue;
    }

    const cleaned = cleanValue(value);
    if (cleaned) {
      normalized.extended![column] = cleaned;
    }
  }

  if (Object.keys(normalized.extended ?? {}).length === 0) {
    delete normalized.extended;
  }

  // An explicit Full name mapping always wins; otherwise, First name +
  // Last name mapped separately are combined into one.
  if (!cleanValue(normalized.full_name) && (mappedFirstName || mappedLastName)) {
    normalized.full_name = [mappedFirstName, mappedLastName].filter(Boolean).join(" ");
  }

  deriveFullName(raw, normalized);
  normalizeImportEnums(normalized);

  if (normalized.full_name) {
    normalized.full_name = normalisePersonName(normalized.full_name);
  }

  return normalized;
}

export function validateNormalizedRow(
  normalized: NormalizedImportRow,
): string | null {
  if (!cleanValue(normalized.full_name)) {
    return "full_name required";
  }

  if (
    normalized.relationship_status &&
    !RELATIONSHIP_STATUSES.includes(
      normalized.relationship_status as (typeof RELATIONSHIP_STATUSES)[number],
    )
  ) {
    return `Invalid relationship status: ${normalized.relationship_status}`;
  }

  if (
    normalized.relationship_type &&
    !RELATIONSHIP_TYPES.includes(
      normalized.relationship_type as (typeof RELATIONSHIP_TYPES)[number],
    )
  ) {
    return `Invalid relationship type: ${normalized.relationship_type}`;
  }

  if (
    normalized.owner_strength &&
    !OWNER_STRENGTHS.includes(
      normalized.owner_strength as (typeof OWNER_STRENGTHS)[number],
    )
  ) {
    return `Invalid owner strength: ${normalized.owner_strength}`;
  }

  return null;
}

export function parseTags(tagsValue: string | undefined): string[] {
  if (!tagsValue?.trim()) {
    return [];
  }

  return [...new Set(tagsValue.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

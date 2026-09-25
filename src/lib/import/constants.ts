import type { Database } from "@/types/database";

import type { ColumnMapping } from "./types";

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5_000;
export const PREVIEW_ROW_LIMIT = 20;

export const IMPORT_SOURCES = [
  "clay",
  "airtable",
  "affinity",
  "attio",
  "hubspot",
  "csv",
  "other",
] as const;

export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const ECOSYSTEM_FIELDS = [
  { key: "full_name", label: "Full name (or map First + Last name below)", required: true },
  { key: "first_name", label: "First name (combines with Last name)", required: false },
  { key: "last_name", label: "Last name (combines with First name)", required: false },
  { key: "email", label: "Email", required: false },
  { key: "organisation_name", label: "Organisation", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "linkedin_url", label: "LinkedIn URL", required: false },
  { key: "occupation", label: "Occupation", required: false },
  { key: "location_city", label: "City", required: false },
  { key: "location_country", label: "Country", required: false },
  { key: "relationship_status", label: "Relationship status", required: false },
  { key: "relationship_type", label: "Relationship type", required: false },
  { key: "owner_email", label: "Owner (email or name)", required: false },
  { key: "owner_strength", label: "Owner strength", required: false },
  { key: "tags", label: "Tags (comma-separated)", required: false },
] as const;

export type EcosystemFieldKey = (typeof ECOSYSTEM_FIELDS)[number]["key"];

export type RelationshipStatus = Database["public"]["Enums"]["relationship_status"];
export type RelationshipType = Database["public"]["Enums"]["relationship_type"];
export type OwnerStrength = Database["public"]["Enums"]["owner_strength"];

export const RELATIONSHIP_STATUSES: RelationshipStatus[] = [
  "prospect",
  "active",
  "partner",
  "advisor",
  "community",
  "dormant",
  "inactive",
];

export const RELATIONSHIP_TYPES: RelationshipType[] = [
  "founder",
  "investor",
  "operator",
  "advisor",
  "partner",
  "sponsor",
  "media",
  "other",
];

export const OWNER_STRENGTHS: OwnerStrength[] = [
  "inner_circle",
  "strong",
  "warm",
  "weak",
  "unknown",
];

const HEADER_ALIASES: Record<EcosystemFieldKey, string[]> = {
  full_name: [
    "full name",
    "fullname",
    "name",
    "contact name",
    "person",
    "person name",
    "lead name",
    "contact",
  ],
  first_name: ["first name", "firstname", "first_name", "given name", "forename"],
  last_name: ["last name", "lastname", "last_name", "surname", "family name"],
  email: [
    "email",
    "e-mail",
    "email address",
    "work email",
    "primary email",
    "personal email",
  ],
  organisation_name: [
    "organisation",
    "organization",
    "company",
    "org",
    "employer",
    "organisation name",
    "organization name",
    "company name",
    "account name",
    "current company",
  ],
  phone: ["phone", "mobile", "telephone", "phone number"],
  linkedin_url: ["linkedin", "linkedin url", "linkedin profile"],
  occupation: [
    "occupation",
    "title",
    "job title",
    "role",
    "position",
    "role / title",
    "role/title",
  ],
  location_city: ["city", "location city", "town", "location"],
  location_country: ["country", "location country", "nation"],
  relationship_status: ["relationship status", "status", "relationship_status"],
  relationship_type: [
    "relationship type",
    "type",
    "relationship_type",
    "ecosystem role",
  ],
  owner_email: [
    "owner email",
    "owner",
    "relationship owner",
    "pu owner",
    "relationship owner email",
  ],
  owner_strength: [
    "owner strength",
    "strength",
    "relationship strength",
  ],
  tags: [
    "tags",
    "tag",
    "labels",
    "sectors",
    "industry / sector",
    "industry/sector",
    "industry sector",
  ],
};

function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ");
}

export function guessColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const usedFields = new Set<string>();

  for (const header of headers) {
    const normalised = normaliseHeader(header);

    for (const field of ECOSYSTEM_FIELDS) {
      if (usedFields.has(field.key)) {
        continue;
      }

      const aliases = HEADER_ALIASES[field.key];
      const matches =
        normalised === field.key.replace(/_/g, " ") ||
        aliases.some((alias) => alias === normalised);

      if (matches) {
        mapping[header] = field.key;
        usedFields.add(field.key);
        break;
      }
    }
  }

  return mapping;
}

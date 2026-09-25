import "server-only";

import { normalisePersonName } from "@/lib/normalise/person-name";

const NON_PERSON_NAME_PREFIXES =
  /^(team|support|info|hello|admin|sales|hr|contact|enquiries|noreply|no-reply)$/i;

export type ParsedCalendarDisplayName = {
  firstName: string;
  lastName: string;
  fullName: string;
};

export function parseCalendarDisplayName(
  displayName: string | null | undefined,
): ParsedCalendarDisplayName | null {
  if (!displayName?.trim()) {
    return null;
  }

  const name = normalisePersonName(
    displayName
      .trim()
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .trim(),
  );

  if (!name || name.includes("@")) {
    return null;
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const firstName = parts[0]!;
  const lastName = parts[parts.length - 1]!;

  if (firstName.length < 2 || lastName.length < 2) {
    return null;
  }

  if (NON_PERSON_NAME_PREFIXES.test(firstName)) {
    return null;
  }

  return {
    firstName: parts[0]!,
    lastName: parts[parts.length - 1]!,
    fullName: name,
  };
}

export function canAutoCreateProfileFromCalendarParticipant(
  email: string,
  displayName: string | null | undefined,
): boolean {
  if (!email.trim()) {
    return false;
  }

  return parseCalendarDisplayName(displayName) !== null;
}

import "server-only";

/** Stable idempotency key for the same meeting across calendar copies. */
export function calendarOccurrenceKey(
  icalUid: string | null | undefined,
  startAt: string | null | undefined,
): string | null {
  if (!icalUid?.trim() || !startAt) {
    return null;
  }

  return `${icalUid.trim()}#${startAt}`;
}

/** Activity and review idempotency — occurrence key when available, else google event id. */
export function calendarActivitySourceRef(
  icalUid: string | null | undefined,
  startAt: string | null | undefined,
  googleEventId: string,
): string {
  return calendarOccurrenceKey(icalUid, startAt) ?? googleEventId;
}

/** All source_ref values that may refer to the same meeting occurrence (legacy + canonical). */
export function calendarActivitySourceRefCandidates(
  icalUid: string | null | undefined,
  startAt: string | null | undefined,
  googleEventId: string,
): string[] {
  const refs = new Set<string>();
  const trimmedEventId = googleEventId.trim();

  if (trimmedEventId) {
    refs.add(trimmedEventId);
  }

  const occurrence = calendarOccurrenceKey(icalUid, startAt);
  if (occurrence) {
    refs.add(occurrence);
  }

  return [...refs];
}

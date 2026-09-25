export type EventTagInput = {
  id: string;
  name: string;
  createdAt: string;
};

export type EventSeriesGroup = {
  /** Normalised grouping key — not shown in the UI. */
  key: string;
  /** Display label — the shortest original tag name in the group, so it's
   * always a real event name rather than an awkwardly-trimmed fragment. */
  label: string;
  /** Every original tag name in the group, for typeahead matching. */
  allNames: string[];
  tagIds: string[];
  mostRecentTagId: string;
  mostRecentCreatedAt: string;
  count: number;
};

// Matches "part 2", "Part II", "#3" etc. anywhere in the name, not just at
// the end — real examples like "Go-To-Market Club part 2 - powered by
// Vantage" have the marker in the middle, before a trailing sponsor credit.
const PART_MARKER_PATTERN = /\b(?:part\s+\d+|part\s+[ivxlcdm]+|#\d+)\b/gi;
const SERIES_WORD_PATTERN = /\bseries\b/gi;

/**
 * Reduces an event name to a grouping key so multi-part series ("Go-To-
 * Market Club", "...part 2", "...Part 3") collapse into one group, and
 * guest-specific episodes of a named series ("I Wish I Knew with X", "I
 * Wish I Knew Series with Y") collapse into another. This is a naming-
 * pattern heuristic, not a real link between events — it only works when
 * event names follow one of these two conventions, and won't catch series
 * named some other way. A durable fix would need a schema column linking
 * related event tags explicitly; this ships without one.
 */
function seriesKey(name: string): string {
  let base = name;

  const withIndex = base.toLowerCase().indexOf(" with ");
  if (withIndex > 0) {
    base = base.slice(0, withIndex);
  }

  base = base
    .replace(PART_MARKER_PATTERN, "")
    .replace(SERIES_WORD_PATTERN, "")
    .replace(/[|:,\-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return base.toLowerCase();
}

export function groupEventSeries(tags: EventTagInput[]): EventSeriesGroup[] {
  const sorted = [...tags].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );

  const byKey = new Map<string, EventTagInput[]>();
  for (const tag of sorted) {
    const key = seriesKey(tag.name) || tag.name.trim().toLowerCase();
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.push(tag);
    } else {
      byKey.set(key, [tag]);
    }
  }

  const groups: EventSeriesGroup[] = [];
  for (const [key, bucket] of byKey) {
    // `bucket` is already newest-first since it was built from `sorted`.
    const mostRecent = bucket[0];
    const label =
      bucket.length > 1
        ? [...bucket].sort((a, b) => a.name.length - b.name.length)[0].name
        : mostRecent.name;

    groups.push({
      key,
      label,
      allNames: bucket.map((tag) => tag.name),
      tagIds: bucket.map((tag) => tag.id),
      mostRecentTagId: mostRecent.id,
      mostRecentCreatedAt: mostRecent.createdAt,
      count: bucket.length,
    });
  }

  return groups.sort(
    (a, b) => Date.parse(b.mostRecentCreatedAt) - Date.parse(a.mostRecentCreatedAt),
  );
}

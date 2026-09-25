"use client";

import { useMemo, useState } from "react";

import { buildSearchTagHref } from "@/components/search/search-filters";
import { FilterChipLink, FilterChipRow } from "@/components/filters/filter-chips";
import { Input } from "@/components/ui/input";
import type { EventSeriesGroup } from "@/lib/search/group-event-series";

type SearchEventFilterProps = {
  groups: EventSeriesGroup[];
  query: string;
  activeTagId?: string;
  activeOwnerId?: string;
  activeStatus?: string;
};

const DEFAULT_VISIBLE = 6;

/**
 * Replaces the old flat wall of every event tag ever created with a
 * searchable typeahead ("Filter by event…"). With nothing typed, shows only
 * the most recent few (recency-ordered, not alphabetical) with a "Show all"
 * toggle for the rest. Multi-part series ("Go-To-Market Club" + "part 2" +
 * "Part 3") are pre-grouped into single chips with a count, via
 * groupEventSeries — a naming-pattern heuristic computed server-side.
 */
export function SearchEventFilter({
  groups,
  query,
  activeTagId,
  activeOwnerId,
  activeStatus,
}: SearchEventFilterProps) {
  const [filterText, setFilterText] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filterOptions = {
    q: query || undefined,
    owner: activeOwnerId,
    status: activeStatus,
  };

  const activeIds = useMemo(
    () => new Set((activeTagId ?? "").split(",").filter(Boolean)),
    [activeTagId],
  );

  const normalizedFilter = filterText.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!normalizedFilter) {
      return groups;
    }
    return groups.filter(
      (group) =>
        group.label.toLowerCase().includes(normalizedFilter) ||
        group.allNames.some((name) =>
          name.toLowerCase().includes(normalizedFilter),
        ),
    );
  }, [groups, normalizedFilter]);

  const visibleGroups =
    normalizedFilter || showAll ? matches : matches.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = matches.length - visibleGroups.length;

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={filterText}
          onChange={(event) => setFilterText(event.target.value)}
          placeholder="Filter by event…"
          className="h-8 w-64"
          aria-label="Filter by event"
        />
        {activeTagId ? (
          <FilterChipLink
            href={buildSearchTagHref(undefined, filterOptions)}
            isActive={false}
          >
            Clear event filter
          </FilterChipLink>
        ) : null}
      </div>

      {matches.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          No matching events.
        </p>
      ) : (
        <FilterChipRow label="Events:">
          {visibleGroups.map((group) => {
            const isActive = group.tagIds.some((id) => activeIds.has(id));
            return (
              <FilterChipLink
                key={group.key}
                href={buildSearchTagHref(group.tagIds.join(","), filterOptions)}
                isActive={isActive}
              >
                {group.label}
                {group.count > 1 ? ` (${group.count})` : ""}
              </FilterChipLink>
            );
          })}
          {!normalizedFilter && hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-caption text-interactive-primary hover:underline"
            >
              Show all {matches.length}
            </button>
          ) : null}
          {!normalizedFilter && showAll && matches.length > DEFAULT_VISIBLE ? (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="text-caption text-interactive-primary hover:underline"
            >
              Show fewer
            </button>
          ) : null}
        </FilterChipRow>
      )}
    </div>
  );
}

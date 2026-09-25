import Link from "next/link";

import {
  FilterChipLink,
  FilterChipRow,
} from "@/components/filters/filter-chips";
import type { OrgUser } from "@/lib/data/users";
import { formatEnumLabel } from "@/lib/format/enum";
import type { Database } from "@/types/database";

type RelationshipStatus = Database["public"]["Enums"]["relationship_status"];

const STATUS_OPTIONS: RelationshipStatus[] = [
  "prospect",
  "active",
  "partner",
  "advisor",
  "community",
  "dormant",
  "inactive",
];

type SearchFiltersProps = {
  query: string;
  teamUsers: OrgUser[];
  activeTagId?: string;
  activeOwnerId?: string;
  activeStatus?: string;
};

function buildSearchHref(options: {
  q?: string;
  tag?: string;
  owner?: string;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (options.q) {
    params.set("q", options.q);
  }
  if (options.tag) {
    params.set("tag", options.tag);
  }
  if (options.owner) {
    params.set("owner", options.owner);
  }
  if (options.status) {
    params.set("status", options.status);
  }
  const queryString = params.toString();
  return queryString ? `/search?${queryString}` : "/search";
}

export function SearchFilters({
  query,
  teamUsers,
  activeTagId,
  activeOwnerId,
  activeStatus,
}: SearchFiltersProps) {
  const hasFilters = activeOwnerId || activeStatus || activeTagId;
  const filterBase = { q: query || undefined };

  return (
    <div className="space-y-3">
      <FilterChipRow label="Owner:">
        <FilterChipLink
          href={buildSearchHref({ ...filterBase, tag: activeTagId, status: activeStatus })}
          isActive={!activeOwnerId}
        >
          All
        </FilterChipLink>
        {teamUsers.map((user) => (
          <FilterChipLink
            key={user.id}
            href={buildSearchHref({
              ...filterBase,
              tag: activeTagId,
              owner: user.id,
              status: activeStatus,
            })}
            isActive={activeOwnerId === user.id}
          >
            {user.fullName}
          </FilterChipLink>
        ))}
      </FilterChipRow>

      <FilterChipRow label="Status:">
        <FilterChipLink
          href={buildSearchHref({ ...filterBase, tag: activeTagId, owner: activeOwnerId })}
          isActive={!activeStatus}
        >
          All
        </FilterChipLink>
        {STATUS_OPTIONS.map((status) => (
          <FilterChipLink
            key={status}
            href={buildSearchHref({
              ...filterBase,
              tag: activeTagId,
              owner: activeOwnerId,
              status,
            })}
            isActive={activeStatus === status}
          >
            {formatEnumLabel(status)}
          </FilterChipLink>
        ))}
      </FilterChipRow>

      {hasFilters ? (
        <Link
          href={query ? `/search?q=${encodeURIComponent(query)}` : "/search"}
          className="text-caption text-interactive-primary hover:underline"
        >
          Clear profile filters
        </Link>
      ) : null}

      <p className="text-caption text-muted-foreground">
        Filters apply to profiles, activity, and events (an event matches if
        at least one attendee fits). Email results aren&apos;t scoped by
        these yet.
      </p>
    </div>
  );
}

export function buildSearchTagHref(
  tagId: string | undefined,
  options: { q?: string; owner?: string; status?: string },
) {
  return buildSearchHref({
    q: options.q,
    tag: tagId,
    owner: options.owner,
    status: options.status,
  });
}

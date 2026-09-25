import { buildSearchTagHref } from "@/components/search/search-filters";
import {
  FilterChipLink,
  FilterChipRow,
} from "@/components/filters/filter-chips";
import type { OrgTag } from "@/lib/data/tags";

type SearchTagFilterProps = {
  tags: OrgTag[];
  query: string;
  activeTagId?: string;
  activeOwnerId?: string;
  activeStatus?: string;
};

export function SearchTagFilter({
  tags,
  query,
  activeTagId,
  activeOwnerId,
  activeStatus,
}: SearchTagFilterProps) {
  const filterOptions = {
    q: query || undefined,
    owner: activeOwnerId,
    status: activeStatus,
  };

  if (tags.length === 0) {
    return null;
  }

  return (
    <FilterChipRow label="Tags:">
      <FilterChipLink
        href={buildSearchTagHref(undefined, filterOptions)}
        isActive={!activeTagId}
      >
        All
      </FilterChipLink>
      {tags.map((tag) => (
        <FilterChipLink
          key={tag.id}
          href={buildSearchTagHref(tag.id, filterOptions)}
          isActive={activeTagId === tag.id}
        >
          {tag.name}
        </FilterChipLink>
      ))}
    </FilterChipRow>
  );
}

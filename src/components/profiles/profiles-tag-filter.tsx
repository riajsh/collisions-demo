import {
  FilterChipLink,
  FilterChipRow,
} from "@/components/filters/filter-chips";
import type { OrgTag } from "@/lib/data/tags";
import type { ProfileCompleteness } from "@/lib/profiles/completeness";
import type { ProfileSortKey, SortOrder } from "@/lib/profiles/list-sort";

type ProfilesTagFilterProps = {
  tags: OrgTag[];
  activeTagId?: string;
  activeOwnerId?: string;
  activeStatus?: string;
  activeCompany?: string;
  activeCity?: string;
  activeComplete?: ProfileCompleteness;
  activeSort?: ProfileSortKey;
  activeOrder?: SortOrder;
  activeEnrich?: boolean;
};

function buildTagHref(
  tagId: string | undefined,
  options?: {
    owner?: string;
    status?: string;
    company?: string;
    city?: string;
    complete?: ProfileCompleteness;
    sort?: ProfileSortKey;
    order?: SortOrder;
    enrich?: boolean;
  },
) {
  const params = new URLSearchParams();
  if (tagId) {
    params.set("tag", tagId);
  }
  if (options?.owner) {
    params.set("owner", options.owner);
  }
  if (options?.status) {
    params.set("status", options.status);
  }
  if (options?.company) {
    params.set("company", options.company);
  }
  if (options?.city) {
    params.set("city", options.city);
  }
  if (options?.complete) {
    params.set("complete", options.complete);
  }
  if (options?.enrich) {
    params.set("enrich", "1");
  }
  if (options?.sort && options.sort !== "name") {
    params.set("sort", options.sort);
  }
  if (options?.order && options.order !== "asc") {
    params.set("order", options.order);
  }
  const query = params.toString();
  return query ? `/profiles?${query}` : "/profiles";
}

export function ProfilesTagFilter({
  tags,
  activeTagId,
  activeOwnerId,
  activeStatus,
  activeCompany,
  activeCity,
  activeComplete,
  activeSort = "name",
  activeOrder = "asc",
  activeEnrich = false,
}: ProfilesTagFilterProps) {
  const filterOptions = {
    owner: activeOwnerId,
    status: activeStatus,
    company: activeCompany,
    city: activeCity,
    complete: activeComplete,
    sort: activeSort,
    order: activeOrder,
    enrich: activeEnrich,
  };

  if (tags.length === 0) {
    return null;
  }

  return (
    <FilterChipRow label="Tags:">
      <FilterChipLink
        href={buildTagHref(undefined, filterOptions)}
        isActive={!activeTagId}
      >
        All
      </FilterChipLink>
      {tags.map((tag) => (
        <FilterChipLink
          key={tag.id}
          href={buildTagHref(tag.id, filterOptions)}
          isActive={activeTagId === tag.id}
        >
          {tag.name}
        </FilterChipLink>
      ))}
    </FilterChipRow>
  );
}

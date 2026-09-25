import Link from "next/link";
import { Suspense } from "react";

import {
  FilterChipLink,
  FilterChipRow,
} from "@/components/filters/filter-chips";
import { ProfilesCityFilter } from "@/components/profiles/profiles-city-filter";
import { ProfilesCompanyFilter } from "@/components/profiles/profiles-company-filter";
import type { OrgUser } from "@/lib/data/users";
import { formatEnumLabel } from "@/lib/format/enum";
import type { ProfileCompleteness } from "@/lib/profiles/completeness";
import type { Database } from "@/types/database";
import type { ProfileSortKey, SortOrder } from "@/lib/profiles/list-sort";

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

const COMPLETENESS_OPTIONS: Array<{
  value: ProfileCompleteness;
  label: string;
}> = [
  { value: "missing-both", label: "Missing company & role" },
  { value: "missing-company", label: "Missing company" },
  { value: "missing-role", label: "Missing role" },
];

type ProfilesListFiltersProps = {
  teamUsers: OrgUser[];
  companies: string[];
  cities: string[];
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

function buildProfilesHref(options: {
  tag?: string;
  owner?: string;
  status?: string;
  company?: string;
  city?: string;
  complete?: ProfileCompleteness;
  sort?: ProfileSortKey;
  order?: SortOrder;
  enrich?: boolean;
}) {
  const params = new URLSearchParams();
  if (options.tag) {
    params.set("tag", options.tag);
  }
  if (options.owner) {
    params.set("owner", options.owner);
  }
  if (options.status) {
    params.set("status", options.status);
  }
  if (options.company) {
    params.set("company", options.company);
  }
  if (options.city) {
    params.set("city", options.city);
  }
  if (options.complete) {
    params.set("complete", options.complete);
  }
  if (options.enrich) {
    params.set("enrich", "1");
  }
  if (options.sort && options.sort !== "name") {
    params.set("sort", options.sort);
  }
  if (options.order && options.order !== "asc") {
    params.set("order", options.order);
  }
  const query = params.toString();
  return query ? `/profiles?${query}` : "/profiles";
}

export function ProfilesListFilters({
  teamUsers,
  companies,
  cities,
  activeTagId,
  activeOwnerId,
  activeStatus,
  activeCompany,
  activeCity,
  activeComplete,
  activeSort = "name",
  activeOrder = "asc",
  activeEnrich = false,
}: ProfilesListFiltersProps) {
  const preserved = {
    tag: activeTagId,
    company: activeCompany,
    city: activeCity,
    complete: activeComplete,
    sort: activeSort,
    order: activeOrder,
    enrich: activeEnrich,
  };
  const hasFilters =
    activeOwnerId ||
    activeStatus ||
    activeCompany ||
    activeCity ||
    activeComplete;

  return (
    <div className="space-y-3">
      <Suspense
        fallback={
          <div className="flex items-center gap-2">
            <span className="text-caption text-muted-foreground">Company:</span>
            <div className="h-8 w-48 animate-pulse rounded-md bg-muted/40" />
          </div>
        }
      >
        <ProfilesCompanyFilter companies={companies} activeCompany={activeCompany} />
      </Suspense>

      <Suspense
        fallback={
          <div className="flex items-center gap-2">
            <span className="text-caption text-muted-foreground">City:</span>
            <div className="h-8 w-48 animate-pulse rounded-md bg-muted/40" />
          </div>
        }
      >
        <ProfilesCityFilter cities={cities} activeCity={activeCity} />
      </Suspense>

      <FilterChipRow label="Data gaps:">
        <FilterChipLink
          href={buildProfilesHref({
            ...preserved,
            owner: activeOwnerId,
            status: activeStatus,
          })}
          isActive={!activeComplete}
        >
          All
        </FilterChipLink>
        {COMPLETENESS_OPTIONS.map((option) => (
          <FilterChipLink
            key={option.value}
            href={buildProfilesHref({
              ...preserved,
              owner: activeOwnerId,
              status: activeStatus,
              complete: option.value,
            })}
            isActive={activeComplete === option.value}
          >
            {option.label}
          </FilterChipLink>
        ))}
      </FilterChipRow>

      <FilterChipRow label="Owner:">
        <FilterChipLink
          href={buildProfilesHref({
            ...preserved,
            status: activeStatus,
          })}
          isActive={!activeOwnerId}
        >
          All
        </FilterChipLink>
        {teamUsers.map((user) => (
          <FilterChipLink
            key={user.id}
            href={buildProfilesHref({
              ...preserved,
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
          href={buildProfilesHref({
            ...preserved,
            owner: activeOwnerId,
          })}
          isActive={!activeStatus}
        >
          All
        </FilterChipLink>
        {STATUS_OPTIONS.map((status) => (
          <FilterChipLink
            key={status}
            href={buildProfilesHref({
              ...preserved,
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
          href={
            activeTagId
              ? buildProfilesHref({ tag: activeTagId, sort: activeSort, order: activeOrder })
              : buildProfilesHref({ sort: activeSort, order: activeOrder })
          }
          className="text-caption text-interactive-primary hover:underline"
        >
          Clear all filters
        </Link>
      ) : null}
    </div>
  );
}

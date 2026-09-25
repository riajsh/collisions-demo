import Link from "next/link";
import { notFound } from "next/navigation";

import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ProfileDetailView } from "@/components/profiles/profile-detail-view";
import { ProfileDrawer } from "@/components/profiles/profile-drawer";
import { ProfilesFilterBar } from "@/components/profiles/profiles-filter-bar";
import {
  ProfilesEnrichModeHint,
  ProfilesEnrichToggle,
} from "@/components/profiles/profiles-enrich-toggle";
import { ProfilesTable } from "@/components/profiles/profiles-table";
import { ProfilesViewControls } from "@/components/profiles/profiles-view-controls";
import { formatCountLabel, ListMeta } from "@/components/ui/list-meta";
import { Button } from "@/components/ui/button";
import {
  getProfileEnrichmentSuggestions,
  getProfileEnrichmentSuggestionsBatch,
} from "@/lib/enrichment/profile-enrichment";
import { getProfileNetworkIntel } from "@/lib/computed/profile-intelligence";
import {
  getProfileById,
  listProfileCities,
  listProfileCompanies,
  listProfiles,
  PROFILES_PAGE_SIZE,
} from "@/lib/data/profiles";
import { listOrgTags } from "@/lib/data/tags";
import { listOrgUsers } from "@/lib/data/users";
import { parseProfileCompleteness } from "@/lib/profiles/completeness";
import { parseEnrichMode } from "@/lib/profiles/enrich-mode";
import { parseProfileGroup } from "@/lib/profiles/list-group";
import { parseProfileSort, parseSortOrder } from "@/lib/profiles/list-sort";
import { requireUser } from "@/lib/auth/session";
import { resolveViewAsOwnerId } from "@/lib/view-as/resolve";
import type { Database } from "@/types/database";

type RelationshipStatus = Database["public"]["Enums"]["relationship_status"];

const VALID_STATUSES: RelationshipStatus[] = [
  "prospect",
  "active",
  "partner",
  "advisor",
  "community",
  "dormant",
  "inactive",
];

type ProfilesPageProps = {
  searchParams: Promise<{
    profile?: string;
    tag?: string;
    owner?: string;
    status?: string;
    company?: string;
    city?: string;
    complete?: string;
    sort?: string;
    order?: string;
    group?: string;
    page?: string;
    enrich?: string;
  }>;
};

function buildListHref(options: {
  tag?: string;
  owner?: string;
  status?: string;
  company?: string;
  city?: string;
  complete?: string;
  sort?: string;
  order?: string;
  group?: string;
  page?: number;
  enrich?: boolean;
}) {
  const params = new URLSearchParams();
  if (options.tag) params.set("tag", options.tag);
  if (options.owner) params.set("owner", options.owner);
  if (options.status) params.set("status", options.status);
  if (options.company) params.set("company", options.company);
  if (options.city) params.set("city", options.city);
  if (options.complete) params.set("complete", options.complete);
  if (options.enrich) params.set("enrich", "1");
  if (options.sort && options.sort !== "name") params.set("sort", options.sort);
  if (options.order && options.order !== "asc") params.set("order", options.order);
  if (options.group) params.set("group", options.group);
  if (options.page && options.page > 1) params.set("page", String(options.page));
  const query = params.toString();
  return query ? `/profiles?${query}` : "/profiles";
}

function buildCloseHref(options: {
  tag?: string;
  owner?: string;
  status?: string;
  company?: string;
  city?: string;
  complete?: string;
  sort?: string;
  order?: string;
  group?: string;
  enrich?: boolean;
}) {
  const params = new URLSearchParams();
  if (options.tag) params.set("tag", options.tag);
  if (options.owner) params.set("owner", options.owner);
  if (options.status) params.set("status", options.status);
  if (options.company) params.set("company", options.company);
  if (options.city) params.set("city", options.city);
  if (options.complete) params.set("complete", options.complete);
  if (options.enrich) params.set("enrich", "1");
  if (options.sort && options.sort !== "name") params.set("sort", options.sort);
  if (options.order && options.order !== "asc") params.set("order", options.order);
  if (options.group) params.set("group", options.group);
  const query = params.toString();
  return query ? `/profiles?${query}` : "/profiles";
}

export default async function ProfilesPage({ searchParams }: ProfilesPageProps) {
  const {
    profile: drawerProfileId,
    tag: tagId,
    owner: ownerParam,
    status,
    company,
    city,
    complete: completeParam,
    sort: sortParam,
    order: orderParam,
    group: groupParam,
    page: pageParam,
    enrich: enrichParam,
  } = await searchParams;

  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const listLimit = page * PROFILES_PAGE_SIZE;
  const sort = parseProfileSort(sortParam);
  const order = parseSortOrder(orderParam);
  const groupBy = parseProfileGroup(groupParam);
  const complete = parseProfileCompleteness(completeParam);
  const enrichRequested = parseEnrichMode(enrichParam);

  if (tagId && !/^[0-9a-f-]{36}$/i.test(tagId)) {
    notFound();
  }

  if (ownerParam && !/^[0-9a-f-]{36}$/i.test(ownerParam)) {
    notFound();
  }

  if (status && !VALID_STATUSES.includes(status as RelationshipStatus)) {
    notFound();
  }

  if (completeParam && !complete) {
    notFound();
  }

  const [currentUser, teamUsers] = await Promise.all([
    requireUser(),
    listOrgUsers(),
  ]);

  const ownerUserId = await resolveViewAsOwnerId(ownerParam, currentUser, teamUsers);
  const enrichMode =
    enrichRequested && currentUser.role === "admin";
  const isAdmin = currentUser.role === "admin";

  const [{ profiles, total, hasMore }, orgTags, companies, cities] =
    await Promise.all([
      listProfiles({
        tagId,
        ownerUserId,
        status: status as RelationshipStatus | undefined,
        company: company?.trim() || undefined,
        city: city?.trim() || undefined,
        complete,
        sort,
        order,
        limit: listLimit,
        offset: 0,
      }),
      listOrgTags(),
      listProfileCompanies(),
      listProfileCities(),
    ]);

  const hasActiveFilters = Boolean(
    tagId || ownerUserId || status || company || city || complete,
  );
  const closeHref = buildCloseHref({
    tag: tagId,
    owner: ownerUserId,
    status,
    company,
    city,
    complete: completeParam,
    sort: sortParam,
    order: orderParam,
    group: groupParam,
    enrich: enrichMode,
  });

  const enrichmentByProfileId = enrichMode
    ? await getProfileEnrichmentSuggestionsBatch(
        profiles.map((profile) => ({
          id: profile.id,
          email: profile.email,
          organisationName: profile.organisationName,
          hasOwner: Boolean(profile.primaryOwner),
        })),
      )
    : null;

  let drawerContent = null;

  if (drawerProfileId) {
    if (!/^[0-9a-f-]{36}$/i.test(drawerProfileId)) {
      notFound();
    }

    const [profile, networkIntel, enrichmentSuggestions] = await Promise.all([
      getProfileById(drawerProfileId),
      getProfileNetworkIntel(drawerProfileId),
      getProfileEnrichmentSuggestions(drawerProfileId),
    ]);

    drawerContent = (
      <ProfileDrawer
        profileId={profile.id}
        profileName={profile.fullName}
        closeHref={closeHref}
        canDelete={!profile.isInternalProfile}
      >
        <ProfileDetailView
          profile={profile}
          teamUsers={teamUsers}
          orgTags={orgTags}
          networkIntel={networkIntel}
          enrichmentSuggestions={enrichmentSuggestions}
          enrichMode={enrichMode}
          currentUserId={currentUser.id}
          mode="drawer"
        />
      </ProfileDrawer>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-20 shrink-0 bg-background">
        <PageHeader
          title="Profiles"
          description="Everyone your team knows — a filterable table of every profile."
        >
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin ? (
              <Suspense fallback={null}>
                <ProfilesEnrichToggle isActive={enrichMode} />
              </Suspense>
            ) : null}
            {isAdmin ? (
              <Button asChild variant="outline">
                <Link href="/profiles/import">Import profiles</Link>
              </Button>
            ) : null}
            <Button asChild>
              <Link href="/profiles/new">New profile</Link>
            </Button>
          </div>
        </PageHeader>
        <div className="shrink-0 space-y-3 border-b border-border px-8 pb-4">
          {enrichMode ? <ProfilesEnrichModeHint /> : null}
          <Suspense fallback={<div className="h-8 w-64 animate-pulse rounded-md bg-muted/40" />}>
            <ProfilesFilterBar
              tags={orgTags}
              teamUsers={teamUsers}
              companies={companies}
              cities={cities}
              activeTagId={tagId}
              activeOwnerId={ownerUserId}
              activeStatus={status}
              activeCompany={company}
              activeCity={city}
              activeComplete={complete}
            />
          </Suspense>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pb-6 pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <ListMeta>
            {formatCountLabel(profiles.length, "profile")}
            {total > profiles.length ? ` of ${total}` : ""}
            {hasActiveFilters ? " matching filters" : ""}
          </ListMeta>
          <Suspense fallback={<div className="h-7 w-64 animate-pulse rounded-md bg-muted/40" />}>
            <ProfilesViewControls sort={sort} order={order} groupBy={groupBy} />
          </Suspense>
        </div>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted/30" />}>
          <ProfilesTable
            profiles={profiles}
            sort={sort}
            order={order}
            groupBy={groupBy}
            hasActiveFilters={hasActiveFilters}
            canImportProfiles={isAdmin}
            enrichMode={enrichMode}
            enrichmentByProfileId={enrichmentByProfileId ?? undefined}
            teamUsers={teamUsers}
          />
        </Suspense>
        {hasMore ? (
          <div className="mt-4 flex justify-center">
            <Button asChild variant="outline">
              <Link
                href={buildListHref({
                  tag: tagId,
                  owner: ownerUserId,
                  status,
                  company,
                  city,
                  complete: completeParam,
                  sort: sortParam,
                  order: orderParam,
                  group: groupParam,
                  page: page + 1,
                  enrich: enrichMode,
                })}
              >
                Load more
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
      {drawerContent}
    </div>
  );
}

import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app-shell/page-header";
import { SearchEventFilter } from "@/components/search/search-event-filter";
import { SearchFilters } from "@/components/search/search-filters";
import { SearchForm } from "@/components/search/search-form";
import { SearchResults } from "@/components/search/search-results";
import { formatCountLabel, ListMeta } from "@/components/ui/list-meta";
import { search } from "@/lib/data/search";
import { listEventTags } from "@/lib/data/tags";
import { listOrgUsers } from "@/lib/data/users";
import { groupEventSeries } from "@/lib/search/group-event-series";
import { requireUser } from "@/lib/auth/session";
import { resolveViewAsOwnerId } from "@/lib/view-as/resolve";
import type { Database } from "@/types/database";

// A descriptive query can now send the AI review step the whole org's
// worth of tagged candidates (see MAX_CANDIDATES_FOR_RERANK in
// semantic-profile-search.ts), which takes meaningfully longer than the
// platform's default function timeout allows for a broad query.
export const maxDuration = 120;

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

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

type SearchPageProps = {
  searchParams: Promise<{
    q?: string;
    tag?: string;
    owner?: string;
    status?: string;
  }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q, tag: tagParam, owner: ownerParam, status } = await searchParams;
  const query = q?.trim() ?? "";

  // A single "tag" param can hold one id or a comma-joined list — a comma-
  // joined list means the person picked an event series (several related
  // tag rows grouped under one filter chip), not just one tag.
  const tagIds = (tagParam ?? "").split(",").filter(Boolean);

  if (tagIds.some((id) => !UUID_PATTERN.test(id))) {
    notFound();
  }

  if (ownerParam && !UUID_PATTERN.test(ownerParam)) {
    notFound();
  }

  if (status && !VALID_STATUSES.includes(status as RelationshipStatus)) {
    notFound();
  }

  const [currentUser, teamUsers, eventTags] = await Promise.all([
    requireUser(),
    listOrgUsers(),
    listEventTags(),
  ]);

  const ownerUserId = await resolveViewAsOwnerId(ownerParam, currentUser, teamUsers);

  const results = query
    ? await search(query, {
        tagIds,
        ownerUserId,
        status: status as RelationshipStatus | undefined,
      })
    : [];

  const hasProfileFilters = Boolean(tagIds.length > 0 || ownerUserId || status);
  const eventGroups = groupEventSeries(eventTags);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-20 shrink-0 bg-background">
        <PageHeader
          title="Search"
          description="Evidence-rich results across profiles, activity, events, and email."
        />
        <div className="space-y-3 border-b border-border px-8 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchForm
              defaultQuery={query}
              autoFocus
              preserveParams={{
                tag: tagParam,
                owner: ownerUserId,
                status,
              }}
            />
            {query ? (
              <ListMeta className="shrink-0">
                {formatCountLabel(results.length, "result")}
              </ListMeta>
            ) : null}
          </div>
          <SearchEventFilter
            groups={eventGroups}
            query={query}
            activeTagId={tagParam}
            activeOwnerId={ownerUserId}
            activeStatus={status}
          />
          <SearchFilters
            query={query}
            teamUsers={teamUsers}
            activeTagId={tagParam}
            activeOwnerId={ownerUserId}
            activeStatus={status}
          />
        </div>
      </div>
      <div className="px-8 py-6">
        <SearchResults
          query={query}
          results={results}
          hasProfileFilters={hasProfileFilters}
        />
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  FilterChipLink,
  FilterChipRow,
} from "@/components/filters/filter-chips";
import { OrbitRadial } from "@/components/orbit/orbit-radial";
import { OrbitView } from "@/components/orbit/orbit-view";
import { OwnerDot } from "@/components/profiles/owner-dot";
import { formatCountLabel, ListMeta } from "@/components/ui/list-meta";
import { getOrbitNodes } from "@/lib/computed/orbit";
import { listOrgUsers } from "@/lib/data/users";
import { requireUser } from "@/lib/auth/session";
import { resolveViewAsOwnerId } from "@/lib/view-as/resolve";

type OrbitPageProps = {
  searchParams: Promise<{ owner?: string; view?: string }>;
};

function buildOrbitHref(owner?: string, view?: string) {
  const params = new URLSearchParams();
  if (owner) {
    params.set("owner", owner);
  }
  if (view && view !== "radial") {
    params.set("view", view);
  }
  const query = params.toString();
  return query ? `/orbit?${query}` : "/orbit";
}

export default async function OrbitPage({ searchParams }: OrbitPageProps) {
  const { owner: ownerParam, view } = await searchParams;
  const [currentUser, teamUsers] = await Promise.all([
    requireUser(),
    listOrgUsers(),
  ]);
  const ownerUserId = await resolveViewAsOwnerId(ownerParam, currentUser, teamUsers);
  const listView = view === "list";

  if (ownerUserId && !/^[0-9a-f-]{36}$/i.test(ownerUserId)) {
    notFound();
  }

  const nodes = await getOrbitNodes(
    ownerUserId ? { ownerUserId } : undefined,
  );
  const totalNodes = Object.values(nodes).reduce(
    (sum, ring) => sum + ring.length,
    0,
  );

  return (
    <>
      <div className="sticky top-0 z-20 shrink-0 bg-background">
        <PageHeader
          title="Orbit"
          description="Relationship strength and recency as distance from centre — colour by primary owner."
        />
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-8 pb-4">
          <FilterChipRow label="Owner:">
            <FilterChipLink
              href={buildOrbitHref(undefined, listView ? "list" : undefined)}
              isActive={!ownerUserId}
            >
              All
            </FilterChipLink>
            {teamUsers.map((user) => (
              <FilterChipLink
                key={user.id}
                href={buildOrbitHref(user.id, listView ? "list" : undefined)}
                isActive={ownerUserId === user.id}
              >
                <span className="inline-flex items-center gap-1.5">
                  <OwnerDot userId={user.id} />
                  {user.fullName}
                </span>
              </FilterChipLink>
            ))}
          </FilterChipRow>
          <FilterChipRow label="View:">
            <FilterChipLink
              href={buildOrbitHref(ownerUserId, undefined)}
              isActive={!listView}
            >
              Radial
            </FilterChipLink>
            <FilterChipLink
              href={buildOrbitHref(ownerUserId, "list")}
              isActive={listView}
            >
              List
            </FilterChipLink>
          </FilterChipRow>
        </div>
      </div>
      <div className="px-8 py-6">
        <ListMeta className="mb-4">
          {formatCountLabel(totalNodes, "profile", "profiles")} in orbit
        </ListMeta>
        {listView ? (
          <OrbitView nodes={nodes} />
        ) : (
          <OrbitRadial
            nodes={nodes}
            listViewHref={buildOrbitHref(ownerUserId, "list")}
          />
        )}
      </div>
    </>
  );
}

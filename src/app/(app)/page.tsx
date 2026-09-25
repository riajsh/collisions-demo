import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app-shell/page-header";
import { OwnershipDistributionCard } from "@/components/overview/ownership-distribution-card";
import { OverviewEventsCard } from "@/components/overview/overview-events-card";
import { OverviewOwnerSelector } from "@/components/overview/overview-owner-selector";
import { RecentActivityCard } from "@/components/overview/recent-activity-card";
import { ReconnectPromptsCard } from "@/components/overview/reconnect-prompts-card";
import { SearchForm } from "@/components/search/search-form";
import { listRecentOrgActivities } from "@/lib/data/activities";
import { getOwnershipSummary } from "@/lib/computed/ownership";
import { getReconnectSuggestions } from "@/lib/computed/connect";
import { listRecentPastEvents, listUpcomingEvents } from "@/lib/data/events";
import { listOrgUsers } from "@/lib/data/users";
import { requireUser } from "@/lib/auth/session";
import { resolveViewAsOwnerId } from "@/lib/view-as/resolve";

type OverviewPageProps = {
  searchParams: Promise<{ owner?: string }>;
};

export default async function OverviewPage({ searchParams }: OverviewPageProps) {
  const { owner: ownerParam } = await searchParams;

  if (ownerParam && !/^[0-9a-f-]{36}$/i.test(ownerParam)) {
    notFound();
  }

  const [currentUser, teamUsers] = await Promise.all([
    requireUser(),
    listOrgUsers(),
  ]);

  const ownerUserId = await resolveViewAsOwnerId(
    ownerParam,
    currentUser,
    teamUsers,
  );

  const ownerOptions = ownerUserId ? { ownerUserId } : undefined;
  const activeOwner = ownerUserId
    ? teamUsers.find((user) => user.id === ownerUserId)
    : undefined;

  const [recentActivity, upcomingEvents, recentEvents, reconnect, ownership] =
    await Promise.all([
      listRecentOrgActivities(8, ownerOptions),
      listUpcomingEvents(5, ownerOptions),
      listRecentPastEvents(5, ownerOptions),
      getReconnectSuggestions(3, ownerOptions),
      getOwnershipSummary(),
    ]);

  const description = activeOwner
    ? `Activity, reconnect prompts, and events for ${activeOwner.fullName}'s relationships.`
    : "Start with search, then follow signals into profiles, Connect, and Events.";

  return (
    <>
      <PageHeader title="Overview" description={description}>
        {teamUsers.length > 0 ? (
          <OverviewOwnerSelector
            teamUsers={teamUsers}
            activeOwnerId={ownerUserId}
            syncViewAsCookie={currentUser.role === "admin"}
          />
        ) : null}
      </PageHeader>
      <div className="space-y-8 px-8 py-6">
        <section className="space-y-3">
          <SearchForm />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption text-muted-foreground">
              Profiles, tags, activity, events, and email subjects. Body matches
              for owners and admins only.
            </p>
            <Link
              href="/search"
              className="text-caption text-interactive-primary hover:underline"
            >
              Advanced search with filters →
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <RecentActivityCard
            activities={recentActivity}
            ownerUserId={ownerUserId}
            ownerName={activeOwner?.fullName}
          />
          <OverviewEventsCard
            upcomingEvents={upcomingEvents}
            recentEvents={recentEvents}
            ownerName={activeOwner?.fullName}
          />
          <ReconnectPromptsCard
            suggestions={reconnect}
            ownerName={activeOwner?.fullName}
          />
          {!ownerUserId ? (
            <OwnershipDistributionCard summary={ownership} />
          ) : null}
        </section>

        <p className="text-body text-muted-foreground">
          Browse the full graph in{" "}
          <Link
            href={
              ownerUserId ? `/profiles?owner=${ownerUserId}` : "/profiles"
            }
            className="text-foreground underline"
          >
            Profiles
          </Link>
          , review suggestions on{" "}
          <Link href="/connect" className="text-foreground underline">
            Connect
          </Link>
          , or explore{" "}
          <Link
            href={ownerUserId ? `/orbit?owner=${ownerUserId}` : "/orbit"}
            className="text-foreground underline"
          >
            Orbit
          </Link>
          .
        </p>
      </div>
    </>
  );
}

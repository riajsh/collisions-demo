import Link from "next/link";

import {
  ApplyPeerCompanyEnrichmentButton,
  InferAllCoAttendanceButton,
  InferSameCompanyButton,
} from "@/components/admin/infer-all-co-attendance-button";
import { AdminPage } from "@/components/admin/admin-page";
import { AutomationTierReference } from "@/components/admin/automation-tier-reference";
import { CalendarAccountRow } from "@/components/admin/calendar-account-row";
import { CalendarBackfillPanel } from "@/components/admin/calendar-backfill-panel";
import { CalendarConnectButton } from "@/components/admin/calendar-connect-button";
import { DeployChecklist } from "@/components/admin/deploy-checklist";
import { EventbriteAccountRow } from "@/components/admin/eventbrite-account-row";
import { EventbriteConnectForm } from "@/components/admin/eventbrite-connect-form";
import { EventbriteSyncNowButton } from "@/components/admin/eventbrite-sync-now-button";
import { RunCalendarSyncButton } from "@/components/admin/run-calendar-sync-button";
import { Button } from "@/components/ui/button";
import { getPrimaryLoginDomain } from "@/lib/auth/allowed-email";
import { requireAdmin } from "@/lib/auth/session";
import { listCalendarAccountsForOrg } from "@/lib/data/calendar-accounts";
import { getEventbriteAccountForOrg } from "@/lib/data/eventbrite-accounts";
import { countPendingEventbriteReviews } from "@/lib/data/eventbrite-reviews";
import { countPendingProfileUpdateReviews } from "@/lib/data/eventbrite-profile-updates";
import { countIncompleteProfiles } from "@/lib/data/profiles";
import { getDeployChecklist } from "@/lib/deploy/checklist";

type AdminPageProps = {
  searchParams: Promise<{
    calendar_connected?: string;
    connected?: string;
    calendar_error?: string;
  }>;
};

export default async function AdminOverviewPage({ searchParams }: AdminPageProps) {
  const user = await requireAdmin();
  const params = await searchParams;
  const internalDomain = getPrimaryLoginDomain();
  const [deployChecks, incompleteCounts] = await Promise.all([
    getDeployChecklist(),
    countIncompleteProfiles(),
  ]);
  let calendarAccounts: Awaited<ReturnType<typeof listCalendarAccountsForOrg>> =
    [];

  try {
    calendarAccounts = await listCalendarAccountsForOrg();
  } catch {
    calendarAccounts = [];
  }

  let eventbriteAccount: Awaited<ReturnType<typeof getEventbriteAccountForOrg>> =
    null;

  try {
    eventbriteAccount = await getEventbriteAccountForOrg();
  } catch {
    eventbriteAccount = null;
  }

  let pendingEventbriteReviewCount = 0;
  try {
    pendingEventbriteReviewCount = await countPendingEventbriteReviews();
  } catch {
    pendingEventbriteReviewCount = 0;
  }

  let pendingProfileUpdateCount = 0;
  try {
    pendingProfileUpdateCount = await countPendingProfileUpdateReviews();
  } catch {
    pendingProfileUpdateCount = 0;
  }

  return (
    <AdminPage
      title="Admin"
      description="Manage your review lists and team settings. CSV imports now live under Profiles."
    >
      <DeployChecklist items={deployChecks} />

      <section className="space-y-3">
        <h2 className="text-heading font-medium text-foreground">
          Profile data gaps
        </h2>
        <p className="max-w-2xl text-body text-muted-foreground">
          Profiles missing company or role — triage from the Profiles list.
        </p>
        <ul className="flex flex-wrap gap-3 text-body">
          <li>
            <Link
              href="/profiles?complete=missing-both"
              className="text-interactive-primary hover:underline"
            >
              {incompleteCounts.missingBoth} missing both
            </Link>
          </li>
          <li>
            <Link
              href="/profiles?complete=missing-company"
              className="text-interactive-primary hover:underline"
            >
              {incompleteCounts.missingCompany} missing company
            </Link>
          </li>
          <li>
            <Link
              href="/profiles?complete=missing-role"
              className="text-interactive-primary hover:underline"
            >
              {incompleteCounts.missingRole} missing role
            </Link>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading font-medium text-foreground">Team</h2>
        <p className="max-w-2xl text-body text-muted-foreground">
          Relationship owners, tags, dedup, and archived contacts.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/admin/team-members">Team members</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/tags">Tags</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/dedup">Duplicates</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/archived">Archived</Link>
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-heading font-medium text-foreground">
          Google Calendar
        </h2>
        <p className="max-w-2xl text-body text-muted-foreground">
          Connect a Google Calendar account to sync your primary calendar plus
          subscribed team calendars
          {internalDomain ? ` (@${internalDomain})` : ""}. Matched external
          attendees become meeting activities; unmatched emails go to review.
        </p>
        <AutomationTierReference variant="compact" />
        {(params.calendar_connected ?? params.connected) ? (
          <p className="text-body text-foreground">
            Connected {params.calendar_connected ?? params.connected}. Run
            calendar sync below to start loading past meetings.
          </p>
        ) : null}
        {calendarAccounts.some((account) => account.backfillPending) ? (
          <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-body text-foreground">
            Past meetings are queued to load for{" "}
            {calendarAccounts
              .filter((account) => account.backfillPending)
              .map((account) => account.email)
              .join(", ")}
            . Load subscribed calendars below, choose which ones, then load
            past meetings.
          </p>
        ) : null}
        {calendarAccounts.some((account) => account.lastSyncError) ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-body text-destructive">
            Last calendar sync failed. Fix the error below before loading past
            meetings.
          </p>
        ) : null}
        {params.calendar_error ? (
          <p className="text-body text-destructive">
            Calendar connect failed: {params.calendar_error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <CalendarConnectButton />
          <RunCalendarSyncButton />
          <Button asChild variant="outline">
            <Link href="/admin/calendar-sync/review">Review sync results</Link>
          </Button>
        </div>
        {calendarAccounts.length > 0 ? (
          <div className="space-y-2 pt-2">
            {calendarAccounts.map((account) => (
              <div key={account.id} className="space-y-3">
                <CalendarAccountRow
                  accountId={account.id}
                  email={account.email}
                  userName={account.userName}
                  syncStatus={account.syncStatus}
                  backfillPending={account.backfillPending}
                  lastSyncError={account.lastSyncError}
                  syncEnabled={account.syncEnabled}
                  isCurrentUser={account.userId === user.id}
                />
                {account.syncEnabled ? (
                  <CalendarBackfillPanel
                    accountId={account.id}
                    accountEmail={account.email}
                    lastSyncError={account.lastSyncError}
                    initialSyncing={account.syncing}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-caption text-muted-foreground">
            No calendar accounts connected yet.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-heading font-medium text-foreground">
          Eventbrite
        </h2>
        <p className="max-w-2xl text-body text-muted-foreground">
          Pulls attendee lists from your organiser account automatically —
          matched attendees are added and tagged with the event&apos;s name;
          unmatched ones go to review. Runs every 30 minutes for events
          happening soon, once a day for everything else.
        </p>
        {eventbriteAccount && eventbriteAccount.syncEnabled ? (
          <>
            <EventbriteAccountRow
              accountName={eventbriteAccount.accountName}
              accountEmail={eventbriteAccount.accountEmail}
              connectedByName={eventbriteAccount.connectedByName}
              syncStatus={eventbriteAccount.syncStatus}
              lastSyncError={eventbriteAccount.lastSyncError}
            />
            <div className="flex flex-wrap items-center gap-3">
              <EventbriteSyncNowButton />
              <Button asChild variant="outline">
                <Link href="/admin/eventbrite/events">Link events</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/admin/eventbrite/review">
                  Review
                  {pendingEventbriteReviewCount + pendingProfileUpdateCount > 0
                    ? ` (${pendingEventbriteReviewCount + pendingProfileUpdateCount})`
                    : ""}
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            {eventbriteAccount?.disabledReason ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-body text-destructive">
                Your Eventbrite connection stopped working: {eventbriteAccount.disabledReason}{" "}
                Reconnect below to pick sync back up.
              </p>
            ) : null}
            <EventbriteConnectForm />
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-heading font-medium text-foreground">
          Automatic connections
        </h2>
        <p className="max-w-2xl text-body text-muted-foreground">
          Find profile-to-profile connections from shared event attendance
          and matching company names. Fill in missing companies when
          colleagues on the same work email domain already have a company
          set.
        </p>
        <div className="flex flex-wrap gap-3">
          <InferAllCoAttendanceButton />
          <InferSameCompanyButton />
          <ApplyPeerCompanyEnrichmentButton />
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-border bg-card p-6">
        <h2 className="text-heading font-medium text-foreground">Coming later</h2>
        <ul className="list-disc space-y-1 pl-5 text-body text-muted-foreground">
          <li>A review list for unmatched emails (needs Gmail set up first)</li>
        </ul>
      </section>
    </AdminPage>
  );
}

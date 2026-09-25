import { AdminPage } from "@/components/admin/admin-page";
import { AutomationTierReference } from "@/components/admin/automation-tier-reference";
import { CalendarSyncReviewWizard } from "@/components/admin/calendar-sync-review-wizard";
import { requireAdmin } from "@/lib/auth/session";
import { autoResolveNamedCalendarReviews } from "@/lib/data/calendar-sync-auto-resolve";
import { listOrgUsers } from "@/lib/data/users";
import {
  getCalendarSyncReviewSummary,
  listPendingCalendarReviewGroupsWithSuggestions,
  listRecentMatchedCalendarMeetings,
} from "@/lib/data/calendar-sync-review";

type CalendarSyncReviewPageProps = {
  searchParams: Promise<{ connected?: string }>;
};

export default async function CalendarSyncReviewPage({
  searchParams,
}: CalendarSyncReviewPageProps) {
  await requireAdmin();
  const params = await searchParams;

  let autoResolveWarning: string | null = null;
  try {
    await autoResolveNamedCalendarReviews();
  } catch (error) {
    autoResolveWarning =
      error instanceof Error
        ? error.message
        : "Couldn't finish automatically; review the list manually.";
    console.error("Calendar auto-resolve failed:", error);
  }

  const [summary, unmatchedGroups, matchedMeetings, teamUsers] =
    await Promise.all([
    getCalendarSyncReviewSummary(),
    listPendingCalendarReviewGroupsWithSuggestions(),
    listRecentMatchedCalendarMeetings(),
    listOrgUsers(),
  ]);

  return (
    <AdminPage
      title="Review calendar sync"
      description="Walk through what Google Calendar pulled in — matched meetings and people who still need a profile. Attendees with a first and last name on Google Calendar are added automatically."
      contentClassName="px-8 py-6"
    >
      {params.connected ? (
        <p className="mb-4 rounded-md border border-border bg-muted/40 px-4 py-3 text-body text-foreground">
          Connected {params.connected}. This runs automatically within a few
          minutes — refresh this page to see meetings and people to review.
        </p>
      ) : null}
      {autoResolveWarning ? (
        <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-body text-foreground">
          Some of this couldn&apos;t be handled automatically: {autoResolveWarning}
        </p>
      ) : null}
      <div className="mb-4">
        <AutomationTierReference />
      </div>
      <CalendarSyncReviewWizard
        summary={summary}
        unmatchedGroups={unmatchedGroups}
        matchedMeetings={matchedMeetings}
        teamUsers={teamUsers}
      />
    </AdminPage>
  );
}

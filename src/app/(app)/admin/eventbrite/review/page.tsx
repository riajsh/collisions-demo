import { AdminPage } from "@/components/admin/admin-page";
import { EventbriteReviewBoard } from "@/components/admin/eventbrite-review-board";
import { requireAdmin } from "@/lib/auth/session";
import { listPendingProfileUpdateReviews } from "@/lib/data/eventbrite-profile-updates";
import { listPendingEventbriteReviews } from "@/lib/data/eventbrite-reviews";

export default async function EventbriteReviewPage() {
  await requireAdmin();

  const [reviews, profileUpdates] = await Promise.all([
    listPendingEventbriteReviews(),
    listPendingProfileUpdateReviews(),
  ]);

  return (
    <AdminPage
      title="Eventbrite review"
      description="Attendees pulled from Eventbrite who didn't match anyone already in Nova Collective, grouped by event, plus profiles whose Eventbrite answers don't match what's on file."
    >
      <EventbriteReviewBoard reviews={reviews} profileUpdates={profileUpdates} />
    </AdminPage>
  );
}

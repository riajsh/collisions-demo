import { redirect } from "next/navigation";

// "Possible updates" now lives at the bottom of the combined Eventbrite
// review screen — this route just forwards anyone with an old link/bookmark.
export default function EventbriteProfileUpdatesRedirectPage() {
  redirect("/admin/eventbrite/review");
}

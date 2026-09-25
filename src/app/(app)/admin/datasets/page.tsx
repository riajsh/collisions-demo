import { redirect } from "next/navigation";

/**
 * The import feature moved to /profiles/import so upload, tag, and check
 * happen in one workflow through Profiles. This route is kept only so old
 * links/bookmarks still land somewhere sensible.
 */
export default function LegacyDatasetsRedirectPage() {
  redirect("/profiles/import");
}

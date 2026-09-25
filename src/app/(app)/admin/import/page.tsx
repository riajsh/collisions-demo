import { redirect } from "next/navigation";

/**
 * The import feature moved to /profiles/import. Kept only for old
 * links/bookmarks.
 */
export default function LegacyImportListRedirectPage() {
  redirect("/profiles/import");
}

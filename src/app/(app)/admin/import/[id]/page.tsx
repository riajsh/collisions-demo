import { redirect } from "next/navigation";

type LegacyImportDetailRedirectPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * The import feature moved to /profiles/import/[id]. Kept only for old
 * links/bookmarks.
 */
export default async function LegacyImportDetailRedirectPage({
  params,
}: LegacyImportDetailRedirectPageProps) {
  const { id } = await params;
  redirect(`/profiles/import/${id}`);
}

import Link from "next/link";

import { AdminPage } from "@/components/admin/admin-page";
import { DedupGroupList } from "@/components/admin/dedup-group-list";
import { EmptyState } from "@/components/ui/empty-state";
import { findDuplicateProfileGroups } from "@/lib/data/profile-dedup";

export default async function AdminDedupPage() {
  const { totalProfiles, groups } = await findDuplicateProfileGroups();
  const redundantProfiles = groups.reduce(
    (sum, group) => sum + (group.profiles.length - 1),
    0,
  );

  return (
    <AdminPage
      title="Duplicate Cleanup"
      description="Find duplicate profiles across your team and merge groups in place."
    >
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-caption text-muted-foreground">Total profiles</dt>
          <dd className="text-subheading font-medium">{totalProfiles}</dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-caption text-muted-foreground">Duplicate groups</dt>
          <dd className="text-subheading font-medium">{groups.length}</dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-caption text-muted-foreground">Profiles to review</dt>
          <dd className="text-subheading font-medium">{redundantProfiles}</dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-caption text-muted-foreground">Match types</dt>
          <dd className="text-body text-muted-foreground">
            Email, phone, LinkedIn, name+company, fuzzy name
          </dd>
        </div>
      </dl>

      <p className="text-body text-muted-foreground">
        Duplicate checking still runs automatically during CSV upload. Use{" "}
        <Link href="/profiles" className="text-interactive-primary hover:underline">
          Profiles
        </Link>{" "}
        to merge arbitrary selections, or merge a whole group below.
      </p>

      {groups.length === 0 ? (
        <EmptyState
          title="No duplicate groups detected"
          description="Email, phone, LinkedIn, and name+organisation matches will appear here."
        />
      ) : (
        <DedupGroupList groups={groups} />
      )}
    </AdminPage>
  );
}

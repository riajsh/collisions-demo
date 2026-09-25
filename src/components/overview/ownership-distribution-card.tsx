import Link from "next/link";

import { OwnerDot } from "@/components/profiles/owner-dot";
import { Badge } from "@/components/ui/badge";
import type { OwnershipSummary } from "@/lib/computed/ownership";

type OwnershipDistributionCardProps = {
  summary: OwnershipSummary;
};

export function OwnershipDistributionCard({
  summary,
}: OwnershipDistributionCardProps) {
  const { owners, unownedProfileCount } = summary;

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-heading font-medium text-foreground">
            Ownership
          </h2>
          <Badge variant="secondary">Automatic</Badge>
        </div>
        <p className="text-caption text-muted-foreground">
          Primary owner counts across the team — filter profiles by owner from
          the list.
        </p>
      </div>

      {owners.length === 0 ? (
        <p className="text-body text-muted-foreground">
          No owners assigned yet. Assign owners on profile detail pages.
        </p>
      ) : (
        <ul className="space-y-2">
          {owners.map((owner) => (
            <li
              key={owner.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <Link
                href={`/profiles?owner=${owner.userId}`}
                className="inline-flex items-center gap-2 text-body text-foreground hover:underline"
              >
                <OwnerDot userId={owner.userId} />
                {owner.fullName}
              </Link>
              <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                <span>{owner.primaryCount} primary</span>
                <span>·</span>
                <span>{owner.ownedCount} total</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {unownedProfileCount > 0 ? (
        <p className="text-caption text-muted-foreground">
          {unownedProfileCount} profile
          {unownedProfileCount === 1 ? "" : "s"} without an assigned owner.
        </p>
      ) : null}
    </section>
  );
}

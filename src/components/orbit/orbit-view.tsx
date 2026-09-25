import Link from "next/link";

import type { OrbitRing } from "@/config/relationship-thresholds";
import { OwnerDot } from "@/components/profiles/owner-dot";
import { StrengthBadge } from "@/components/profiles/strength-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatInteractionDate } from "@/lib/format/date";
import type { OrbitNode } from "@/lib/computed/orbit";

const RING_LABELS: Record<OrbitRing, string> = {
  inner_circle: "Inner circle",
  active_network: "Active network",
  extended: "Extended network",
  dormant: "Dormant",
};

const RING_DESCRIPTIONS: Record<OrbitRing, string> = {
  inner_circle: "Strong relationships, active in the last 6 months.",
  active_network: "Warm ties, or strong relationships going quiet (6–9 months).",
  extended: "Weaker ties still active in the last 6 months.",
  dormant: "No meaningful activity in 9+ months.",
};

type OrbitViewProps = {
  nodes: Record<OrbitRing, OrbitNode[]>;
};

export function OrbitView({ nodes }: OrbitViewProps) {
  const rings = Object.keys(nodes) as OrbitRing[];

  return (
    <div className="space-y-8">
      {rings.map((ring) => (
        <section key={ring} className="space-y-3" aria-labelledby={`orbit-ring-${ring}`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`orbit-ring-${ring}`} className="text-heading font-medium text-foreground">
              {RING_LABELS[ring]}
            </h2>
            <Badge variant="secondary">{nodes[ring].length}</Badge>
          </div>
          <p className="text-body text-muted-foreground">
            {RING_DESCRIPTIONS[ring]}
          </p>

          {nodes[ring].length === 0 ? (
            <EmptyState
              variant="dashed"
              title={`No profiles in ${RING_LABELS[ring].toLowerCase()}`}
              description="Adjust the owner filter to see profiles in this ring."
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {nodes[ring].map((node) => (
                <li key={node.profileId}>
                  <Link
                    href={`/profiles/${node.profileId}`}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-body font-medium text-foreground">
                          {node.fullName}
                        </p>
                        <p className="text-caption text-muted-foreground">
                          {node.organisationName ?? "—"}
                        </p>
                      </div>
                      {node.primaryOwnerUserId ? (
                        <OwnerDot userId={node.primaryOwnerUserId} />
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {node.ownerStrength ? (
                        <StrengthBadge strength={node.ownerStrength} />
                      ) : null}
                      <span className="text-caption text-muted-foreground">
                        {node.primaryOwnerName ?? "Unowned"} ·{" "}
                        {formatInteractionDate(node.lastInteractionAt)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

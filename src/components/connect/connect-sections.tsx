import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatInteractionDate } from "@/lib/format/date";
import { formatEnumLabel } from "@/lib/format/enum";
import type {
  EmergingSuggestion,
  IntroduceSuggestion,
  ReconnectSuggestion,
} from "@/lib/computed/connect";

type ConnectSectionsProps = {
  reconnect: ReconnectSuggestion[];
  introduce: IntroduceSuggestion[];
  emerging: EmergingSuggestion[];
};

function EmptySection({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <EmptyState variant="dashed" title={title} description={description} />
  );
}

export function ConnectSections({
  reconnect,
  introduce,
  emerging,
}: ConnectSectionsProps) {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-heading font-medium text-foreground">Reconnect</h2>
          <p className="text-body text-muted-foreground">
            Strong relationships with no activity in 6+ months.
          </p>
        </div>
        {reconnect.length === 0 ? (
          <EmptySection
            title="Nothing to reconnect yet"
            description="Assign owners and log activity — quiet strong relationships will appear here."
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {reconnect.map((item) => (
              <li key={item.profileId} className="px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Link
                    href={`/profiles/${item.profileId}`}
                    className="flex flex-col gap-1"
                  >
                    <p className="text-body font-medium text-foreground">
                      {item.fullName}
                    </p>
                    <p className="text-caption text-muted-foreground">
                      {item.organisationName ?? "—"}
                      {item.primaryOwnerName ? ` · ${item.primaryOwnerName}` : ""}
                    </p>
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {formatEnumLabel(item.ownerStrength)}
                    </Badge>
                    <span className="text-caption text-muted-foreground">
                      {formatInteractionDate(item.lastInteractionAt)} ·{" "}
                      {item.monthsSinceInteraction} mo
                    </span>
                    <Link
                      href={`/profiles/${item.profileId}?tab=activity`}
                      className="text-caption text-interactive-primary hover:underline"
                    >
                      Log reconnect
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-heading font-medium text-foreground">Introduce</h2>
          <p className="text-body text-muted-foreground">
            Pairs who share tags or events but have no connection edge yet.
          </p>
        </div>
        {introduce.length === 0 ? (
          <EmptySection
            title="No introduction pairs yet"
            description="Tag profiles and record event attendance to surface warm intro opportunities."
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {introduce.map((item) => (
              <li
                key={`${item.profileAId}-${item.profileBId}`}
                className="px-4 py-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-body text-foreground">
                    <Link
                      href={`/profiles/${item.profileAId}`}
                      className="font-medium hover:underline"
                    >
                      {item.profileAName}
                    </Link>
                    {" ↔ "}
                    <Link
                      href={`/profiles/${item.profileBId}`}
                      className="font-medium hover:underline"
                    >
                      {item.profileBName}
                    </Link>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{item.reason}</Badge>
                    <Link
                      href={`/profiles/${item.profileAId}?tab=connections`}
                      className="text-caption text-interactive-primary hover:underline"
                    >
                      Add connection
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-heading font-medium text-foreground">Emerging</h2>
          <p className="text-body text-muted-foreground">
            Profiles with a recent activity spike worth watching.
          </p>
        </div>
        {emerging.length === 0 ? (
          <EmptySection
            title="No emerging signals yet"
            description="Log multiple activities on a profile within 60 days to flag momentum."
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {emerging.map((item) => (
              <li key={item.profileId} className="px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Link href={`/profiles/${item.profileId}`} className="flex flex-col gap-1">
                    <p className="text-body font-medium text-foreground">
                      {item.fullName}
                    </p>
                    <p className="text-caption text-muted-foreground">
                      {item.organisationName ?? "—"}
                    </p>
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.signal}</Badge>
                    <Link
                      href={`/profiles/${item.profileId}?tab=activity`}
                      className="text-caption text-interactive-primary hover:underline"
                    >
                      View activity
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

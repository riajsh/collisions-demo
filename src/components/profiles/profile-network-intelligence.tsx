"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatEnumLabel } from "@/lib/format/enum";
import { formatInteractionDate } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import type { ProfileConnection, ProfileEvent } from "@/lib/data/profiles";
import type { ProfileNetworkIntel } from "@/lib/computed/profile-intelligence";

type ProfileNetworkIntelligenceProps = {
  connections: ProfileConnection[];
  events: ProfileEvent[];
  intel: ProfileNetworkIntel;
};

type AccordionKey = "connections" | "events" | "company";

/**
 * Real linked records you can expand into, not just a count with a link
 * elsewhere — replaces the old three-stat row that just pointed at separate
 * tabs. Connections and events attended come straight from the profile
 * that's already loaded (no extra query); "also at this company" is the one
 * stat that still needs its own lookup.
 */
export function ProfileNetworkIntelligence({
  connections,
  events,
  intel,
}: ProfileNetworkIntelligenceProps) {
  const [openSection, setOpenSection] = useState<AccordionKey | null>(null);

  function toggle(key: AccordionKey) {
    setOpenSection((current) => (current === key ? null : key));
  }

  const sortedEvents = [...events].sort(
    (a, b) => Date.parse(b.eventDate) - Date.parse(a.eventDate),
  );

  return (
    <div className="space-y-1 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <p className="text-subheading font-medium text-foreground">
          Network intelligence
        </p>
        <Badge variant="secondary">Automatic</Badge>
      </div>

      <AccordionRow
        label="Connections"
        count={connections.length}
        isOpen={openSection === "connections"}
        onToggle={() => toggle("connections")}
      >
        {connections.length === 0 ? (
          <EmptyRow>No connections logged yet.</EmptyRow>
        ) : (
          <ul className="space-y-1">
            {connections.map((connection) => (
              <li key={connection.id}>
                <Link
                  href={`/profiles/${connection.otherProfileId}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-body hover:bg-muted/50"
                >
                  <span className="text-foreground">{connection.otherFullName}</span>
                  <span className="text-caption text-muted-foreground">
                    {formatEnumLabel(connection.connectionType)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AccordionRow>

      <AccordionRow
        label="Events attended"
        count={events.length}
        isOpen={openSection === "events"}
        onToggle={() => toggle("events")}
      >
        {sortedEvents.length === 0 ? (
          <EmptyRow>No events attended yet.</EmptyRow>
        ) : (
          <ul className="space-y-1">
            {sortedEvents.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/events/${event.id}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-body hover:bg-muted/50"
                >
                  <span className="text-foreground">{event.title}</span>
                  <span className="text-caption text-muted-foreground">
                    {formatInteractionDate(event.eventDate)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AccordionRow>

      <AccordionRow
        label={intel.sameCompanyName ? `Also at ${intel.sameCompanyName}` : "Same company"}
        count={intel.sameCompanyProfiles.length}
        countSuffix={intel.sameCompanyTruncated ? "+" : ""}
        isOpen={openSection === "company"}
        onToggle={() => toggle("company")}
      >
        {intel.sameCompanyProfiles.length === 0 ? (
          <EmptyRow>No one else on file at this company yet.</EmptyRow>
        ) : (
          <ul className="space-y-1">
            {intel.sameCompanyProfiles.map((peer) => (
              <li key={peer.id}>
                <Link
                  href={`/profiles/${peer.id}`}
                  className="block rounded-md px-2 py-1.5 text-body text-foreground hover:bg-muted/50"
                >
                  {peer.fullName}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {intel.sameCompanyTruncated ? (
          <Link
            href={`/profiles?company=${encodeURIComponent(intel.sameCompanyName ?? "")}`}
            className="mt-1 block px-2 text-caption text-interactive-primary hover:underline"
          >
            View all in Profiles →
          </Link>
        ) : null}
      </AccordionRow>
    </div>
  );
}

function AccordionRow({
  label,
  count,
  countSuffix = "",
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  countSuffix?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 py-2.5 text-left"
      >
        <span className="text-body font-medium text-foreground">{label}</span>
        <span className="flex items-center gap-2">
          <span className="text-body text-muted-foreground">
            {count}
            {countSuffix}
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </span>
      </button>
      {isOpen ? <div className="pb-2">{children}</div> : null}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-1.5 text-body text-muted-foreground">{children}</p>;
}

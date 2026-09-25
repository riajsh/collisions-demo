"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import type { OrbitRing } from "@/config/relationship-thresholds";
import { ownerColour } from "@/config/owner-colours";
import { TEAM_MEMBERS } from "@/config/team-members";
import { EmptyState } from "@/components/ui/empty-state";
import type { OrbitNode } from "@/lib/computed/orbit";
import { cn } from "@/lib/utils";

const RING_ORDER: OrbitRing[] = [
  "inner_circle",
  "active_network",
  "extended",
  "dormant",
];

const RING_LABELS: Record<OrbitRing, string> = {
  inner_circle: "Inner circle",
  active_network: "Active network",
  extended: "Extended network",
  dormant: "Dormant",
};

const RING_RADIUS_PERCENT = [18, 32, 46, 60];

const MAX_NODES_PER_RING = 16;

type OrbitRadialProps = {
  nodes: Record<OrbitRing, OrbitNode[]>;
  listViewHref?: string;
};

type PlacedNode = {
  node: OrbitNode;
  ring: OrbitRing;
  x: number;
  y: number;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function buildPlacedNodes(
  nodes: Record<OrbitRing, OrbitNode[]>,
): PlacedNode[] {
  const placed: PlacedNode[] = [];

  RING_ORDER.forEach((ring, ringIndex) => {
    const ringNodes = nodes[ring].slice(0, MAX_NODES_PER_RING);

    ringNodes.forEach((node, index) => {
      const angle =
        (2 * Math.PI * index) / Math.max(ringNodes.length, 1) - Math.PI / 2;
      const radius = RING_RADIUS_PERCENT[ringIndex];

      placed.push({
        node,
        ring,
        x: 50 + radius * Math.cos(angle),
        y: 50 + radius * Math.sin(angle),
      });
    });
  });

  return placed;
}

export function OrbitRadial({ nodes, listViewHref = "/orbit?view=list" }: OrbitRadialProps) {
  const placedNodes = useMemo(() => buildPlacedNodes(nodes), [nodes]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const nodeRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  if (placedNodes.length === 0) {
    return (
      <EmptyState
        variant="dashed"
        title="No profiles in this view"
        description="Try a different owner filter, or switch to list view for the full set."
      >
        <Link
          href={listViewHref}
          className="text-body text-interactive-primary hover:underline"
        >
          Open list view →
        </Link>
      </EmptyState>
    );
  }

  function moveFocus(nextIndex: number) {
    const bounded =
      ((nextIndex % placedNodes.length) + placedNodes.length) %
      placedNodes.length;
    setFocusedIndex(bounded);
    nodeRefs.current[bounded]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveFocus(focusedIndex + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveFocus(focusedIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        moveFocus(0);
        break;
      case "End":
        event.preventDefault();
        moveFocus(placedNodes.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div className="space-y-6">
      <div
        className="relative mx-auto aspect-square w-full max-w-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        role="application"
        aria-label="Relationship orbit diagram. Arrow keys move between profiles; Enter opens the selected profile."
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {RING_RADIUS_PERCENT.map((radius) => (
          <div
            key={radius}
            className="pointer-events-none absolute rounded-full border border-dashed border-border"
            style={{
              width: `${radius * 2}%`,
              height: `${radius * 2}%`,
              left: `${50 - radius}%`,
              top: `${50 - radius}%`,
            }}
          />
        ))}

        <div className="pointer-events-none absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" />

        {placedNodes.map((item, index) => (
          <Link
            key={item.node.profileId}
            ref={(element) => {
              nodeRefs.current[index] = element;
            }}
            href={`/profiles/${item.node.profileId}`}
            tabIndex={focusedIndex === index ? 0 : -1}
            aria-label={`${item.node.fullName}, ${RING_LABELS[item.ring]}${item.node.organisationName ? `, ${item.node.organisationName}` : ""}`}
            className={cn(
              "absolute flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-card text-caption font-medium text-foreground shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              focusedIndex === index && "scale-110 ring-2 ring-ring ring-offset-2",
            )}
            style={{
              left: `${item.x}%`,
              top: `${item.y}%`,
              borderColor: item.node.primaryOwnerUserId
                ? ownerColour(item.node.primaryOwnerUserId)
                : "var(--color-border-default)",
            }}
            onFocus={() => setFocusedIndex(index)}
          >
            <span aria-hidden>{initials(item.node.fullName)}</span>
          </Link>
        ))}
      </div>

      <p className="text-center text-caption text-muted-foreground">
        Use arrow keys to move between profiles, Enter to open.{" "}
        <Link href={listViewHref} className="text-interactive-primary hover:underline">
          List view
        </Link>{" "}
        shows everyone.
      </p>

      <div className="flex flex-wrap justify-center gap-4 text-caption text-muted-foreground">
        {RING_ORDER.map((ring) => {
          const count = nodes[ring].length;
          if (count === 0) {
            return null;
          }

          const overflow = count - MAX_NODES_PER_RING;
          return (
            <span key={ring}>
              {RING_LABELS[ring]}: {Math.min(count, MAX_NODES_PER_RING)}
              {overflow > 0 ? ` (+${overflow} in list)` : ""}
            </span>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {TEAM_MEMBERS.map((member) => (
          <span
            key={member.id}
            className="inline-flex items-center gap-1.5 text-caption text-muted-foreground"
          >
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: member.colourToken }}
              aria-hidden
            />
            {member.fullName}
          </span>
        ))}
      </div>
    </div>
  );
}

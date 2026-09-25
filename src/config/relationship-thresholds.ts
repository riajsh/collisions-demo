/** Recency bands — ADR 0005. Months since last interaction. */
export const RELATIONSHIP_THRESHOLDS = {
  activeMonths: 6,
  reconnectMonths: 9,
  reconnectOwnerStrengths: ["inner_circle", "strong"] as const,
  emergingActivityWindowDays: 60,
  emergingMinActivities: 2,
} as const;

export type RecencyBand = "active" | "reconnect" | "dormant";

export type OrbitRing =
  | "inner_circle"
  | "active_network"
  | "extended"
  | "dormant";

export function monthsSince(iso: string | null): number | null {
  if (!iso) {
    return null;
  }

  const then = new Date(iso).getTime();
  const now = Date.now();
  const months = (now - then) / (1000 * 60 * 60 * 24 * 30.4375);
  return Math.max(0, months);
}

export function getRecencyBand(months: number | null): RecencyBand | null {
  if (months === null) {
    return null;
  }

  if (months < RELATIONSHIP_THRESHOLDS.activeMonths) {
    return "active";
  }

  if (months < RELATIONSHIP_THRESHOLDS.reconnectMonths) {
    return "reconnect";
  }

  return "dormant";
}

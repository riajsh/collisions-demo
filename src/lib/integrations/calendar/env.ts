import "server-only";

import { z } from "zod";

const calendarEnvSchema = z.object({
  GOOGLE_CALENDAR_CLIENT_ID: z.string().min(1),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALENDAR_REDIRECT_URI: z.string().url().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().min(16),
});

export type CalendarEnv = z.infer<typeof calendarEnvSchema>;

let cached: CalendarEnv | null = null;

export function getCalendarEnv(): CalendarEnv {
  if (cached) {
    return cached;
  }

  const parsed = calendarEnvSchema.safeParse({
    GOOGLE_CALENDAR_CLIENT_ID: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    GOOGLE_CALENDAR_CLIENT_SECRET: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    GOOGLE_CALENDAR_REDIRECT_URI: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
  });

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Calendar sync is not configured:\n${formatted}`);
  }

  cached = parsed.data;
  return cached;
}

export const CALENDAR_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** How far back the initial sync pulls events (months). Override via CALENDAR_BACKFILL_MONTHS. */
export const CALENDAR_BACKFILL_MONTHS = parsePositiveInt(
  process.env.CALENDAR_BACKFILL_MONTHS,
  14,
);

/** How far ahead the sync window extends (weeks). Override via CALENDAR_LOOKAHEAD_WEEKS. */
export const CALENDAR_LOOKAHEAD_WEEKS = parsePositiveInt(
  process.env.CALENDAR_LOOKAHEAD_WEEKS,
  6,
);

/** Optional fixed backfill start (ISO date, e.g. 2025-06-01). Overrides month count when set. */
export function calendarBackfillTimeMin(): string {
  const explicit = process.env.CALENDAR_BACKFILL_FROM?.trim();
  if (explicit) {
    return new Date(explicit).toISOString();
  }

  const date = new Date();
  date.setMonth(date.getMonth() - CALENDAR_BACKFILL_MONTHS);
  return date.toISOString();
}

export function calendarLookaheadCutoff(): Date {
  const date = new Date();
  date.setDate(date.getDate() + CALENDAR_LOOKAHEAD_WEEKS * 7);
  return date;
}

export function isBeyondCalendarLookahead(startAt: string | null): boolean {
  if (!startAt) {
    return false;
  }

  return new Date(startAt) > calendarLookaheadCutoff();
}

/** Max Google Calendar list pages per serverless chunk (~250 events/page). */
export const CALENDAR_SYNC_MAX_PAGES_PER_CHUNK = parsePositiveInt(
  process.env.CALENDAR_SYNC_MAX_PAGES_PER_CHUNK,
  2,
);

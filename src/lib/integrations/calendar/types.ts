export type CalendarParticipant = {
  email: string;
  name: string | null;
  responseStatus: string | null;
  organizer: boolean;
};

export type ParsedCalendarEvent = {
  googleEventId: string;
  icalUid: string | null;
  sourceCalendarId: string;
  title: string | null;
  description: string | null;
  participants: CalendarParticipant[];
  startAt: string | null;
  endAt: string | null;
  isDeleted: boolean;
};

export type CalendarSyncStats = {
  eventsProcessed: number;
  eventsSkippedDuplicate: number;
  calendarsSynced: number;
  activitiesCreated: number;
  reviewsQueued: number;
  profilesAutoCreated: number;
  errors: string[];
  rateLimited?: boolean;
};

export type CalendarSyncRunResult = {
  stats: CalendarSyncStats;
  hasMore: boolean;
  progress: import("@/lib/integrations/calendar/sync-progress").CalendarSyncProgress | null;
};

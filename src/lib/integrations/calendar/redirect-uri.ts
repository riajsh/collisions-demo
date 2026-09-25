const CALENDAR_CALLBACK_PATH = "/api/auth/google-calendar/callback";

export function getCalendarRedirectUri(origin: string): string {
  return `${new URL(origin).origin}${CALENDAR_CALLBACK_PATH}`;
}

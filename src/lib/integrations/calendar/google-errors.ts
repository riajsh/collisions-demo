import "server-only";

import { GaxiosError } from "gaxios";

export function formatGoogleCalendarError(error: unknown): string {
  if (error instanceof GaxiosError) {
    const body = error.response?.data as
      | { error?: string; error_description?: string }
      | undefined;
    const code = body?.error ?? error.message;

    if (code === "invalid_client") {
      return "Google Calendar OAuth is misconfigured (invalid_client). Check GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, and GOOGLE_CALENDAR_REDIRECT_URI in Vercel — they must match your Google Cloud OAuth app.";
    }

    if (code === "invalid_grant") {
      return "Google refresh token is invalid or revoked. Disconnect and reconnect Google Calendar from Admin.";
    }

    if (body?.error_description) {
      return `${code}: ${body.error_description}`;
    }

    return code;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown Google Calendar API error";
}

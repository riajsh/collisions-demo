import "server-only";

import { google } from "googleapis";

import { decryptToken } from "@/lib/integrations/google/crypto";
import { getCalendarEnv } from "@/lib/integrations/calendar/env";

type CalendarAccountRow = {
  id: string;
  email: string;
  refresh_token: string;
};

export function createOAuth2Client(redirectUri: string) {
  const env = getCalendarEnv();

  return new google.auth.OAuth2(
    env.GOOGLE_CALENDAR_CLIENT_ID,
    env.GOOGLE_CALENDAR_CLIENT_SECRET,
    redirectUri,
  );
}

export function getCalendarClient(account: CalendarAccountRow) {
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() ??
    `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/auth/google-calendar/callback`;
  const oauth2 = createOAuth2Client(redirectUri);
  oauth2.setCredentials({
    refresh_token: decryptToken(account.refresh_token),
  });

  return google.calendar({ version: "v3", auth: oauth2, timeout: 30_000 });
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const oauth2 = createOAuth2Client(redirectUri);
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke prior access and reconnect with consent.",
    );
  }

  oauth2.setCredentials(tokens);
  const oauth2User = google.oauth2({ version: "v2", auth: oauth2 });
  const { data: userInfo } = await oauth2User.userinfo.get();

  if (!userInfo.email) {
    throw new Error("Could not resolve Google account email");
  }

  return {
    email: userInfo.email.toLowerCase(),
    refreshToken: tokens.refresh_token,
  };
}

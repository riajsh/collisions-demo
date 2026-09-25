import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { createOAuth2Client } from "@/lib/integrations/calendar/client";
import {
  CALENDAR_READONLY_SCOPE,
  getCalendarEnv,
} from "@/lib/integrations/calendar/env";
import { getCalendarRedirectUri } from "@/lib/integrations/calendar/redirect-uri";
import {
  createOAuthState,
  STATE_COOKIE,
} from "@/lib/integrations/google/oauth-state";

export async function GET(request: Request) {
  try {
    const { origin } = new URL(request.url);
    const redirectUri = getCalendarRedirectUri(origin);
    const user = await requireUser();
    getCalendarEnv();

    const oauth2 = createOAuth2Client(redirectUri);
    const { state, cookieValue } = createOAuthState(user.id, "calendar");

    const authUrl = oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: ["openid", "email", "profile", CALENDAR_READONLY_SCOPE],
      state,
    });

    const response = NextResponse.redirect(authUrl);
    response.cookies.set(STATE_COOKIE, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Calendar connect failed";
    const { origin } = new URL(request.url);
    return NextResponse.redirect(
      `${origin}/admin?calendar_error=${encodeURIComponent(message)}`,
    );
  }
}

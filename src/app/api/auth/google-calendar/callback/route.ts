import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { requireUser } from "@/lib/auth/session";
import { exchangeCodeForTokens } from "@/lib/integrations/calendar/client";
import { getCalendarEnv } from "@/lib/integrations/calendar/env";
import { getCalendarRedirectUri } from "@/lib/integrations/calendar/redirect-uri";
import { upsertCalendarAccount } from "@/lib/integrations/calendar/sync";
import { encryptToken } from "@/lib/integrations/google/crypto";
import {
  STATE_COOKIE,
  verifyOAuthState,
} from "@/lib/integrations/google/oauth-state";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/admin?calendar_error=${encodeURIComponent(oauthError)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/admin?calendar_error=${encodeURIComponent("Missing OAuth code")}`,
    );
  }

  try {
    const user = await requireUser();
    getCalendarEnv();

    const cookieStore = await cookies();
    const stateCookie = cookieStore.get(STATE_COOKIE)?.value;

    if (!verifyOAuthState(state, stateCookie, "calendar", user.id)) {
      return NextResponse.redirect(
        `${origin}/admin?calendar_error=${encodeURIComponent("Invalid OAuth state")}`,
      );
    }

    const redirectUri = getCalendarRedirectUri(origin);
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    await upsertCalendarAccount({
      orgId: user.org_id,
      userId: user.id,
      email: tokens.email,
      encryptedRefreshToken: encryptToken(tokens.refreshToken),
    });

    const response = NextResponse.redirect(
      `${origin}/admin/calendar-sync/review?connected=${encodeURIComponent(tokens.email)}`,
    );
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Calendar callback failed";
    return NextResponse.redirect(
      `${origin}/admin?calendar_error=${encodeURIComponent(message)}`,
    );
  }
}

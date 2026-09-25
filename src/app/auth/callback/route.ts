import { NextResponse } from "next/server";

import { assertLoginRateLimitByIp } from "@/lib/auth/login-rate-limit";
import { isAllowedLoginEmail } from "@/lib/auth/allowed-email";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { ensureUserRow } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const safePath = getSafeRedirectPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  try {
    await assertLoginRateLimitByIp();
  } catch {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Too many sign-in attempts. Try again in a few minutes.")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=missing_user`);
  }

  if (user.email && !isAllowedLoginEmail(user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Sign in with your work Google account.")}`,
    );
  }

  try {
    await ensureUserRow(user);
  } catch (bootstrapError) {
    const message =
      bootstrapError instanceof Error
        ? bootstrapError.message
        : "bootstrap_failed";
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${safePath}`);
}

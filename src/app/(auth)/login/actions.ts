"use server";

import { redirect } from "next/navigation";

import { assertLoginRateLimit, assertLoginRateLimitByIp } from "@/lib/auth/login-rate-limit";
import { getPrimaryLoginDomain, isAllowedLoginEmail } from "@/lib/auth/allowed-email";
import { formatLoginError } from "@/lib/auth/login-errors";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";
import { ensureUserRow } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env/public";
import { createClient } from "@/lib/supabase/server";

function loginRedirect(error: string): never {
  redirect(`/login?error=${encodeURIComponent(error)}`);
}

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email) {
    loginRedirect("Enter your email address.");
  }

  if (!password) {
    loginRedirect("Enter your password.");
  }

  try {
    await assertLoginRateLimit(email);
  } catch (rateLimitError) {
    loginRedirect(
      rateLimitError instanceof Error
        ? rateLimitError.message
        : "Too many sign-in attempts. Try again in a few minutes.",
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    loginRedirect(formatLoginError(error.message));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authedUser = user;
  if (!authedUser) {
    loginRedirect("Sign-in succeeded but no user session was created.");
  }

  if (authedUser.email && !isAllowedLoginEmail(authedUser.email)) {
    await supabase.auth.signOut();
    loginRedirect("Sign in with your work Google account.");
  }

  try {
    await ensureUserRow(authedUser);
  } catch (bootstrapError) {
    const message =
      bootstrapError instanceof Error
        ? bootstrapError.message
        : "Failed to bootstrap user account.";
    loginRedirect(message);
  }

  redirect("/");
}

export async function signInWithGoogle(formData: FormData) {
  try {
    await assertLoginRateLimitByIp();
  } catch (rateLimitError) {
    loginRedirect(
      rateLimitError instanceof Error
        ? rateLimitError.message
        : "Too many sign-in attempts. Try again in a few minutes.",
    );
  }

  const next = getSafeRedirectPath(String(formData.get("next") ?? ""));
  const redirectTo = new URL(`${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback`);
  if (next !== "/") {
    redirectTo.searchParams.set("next", next);
  }

  const primaryDomain = getPrimaryLoginDomain();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectTo.toString(),
      ...(primaryDomain
        ? { queryParams: { hd: primaryDomain } }
        : undefined),
    },
  });

  if (error) {
    loginRedirect(formatLoginError(error.message));
  }

  if (!data.url) {
    loginRedirect("Google sign-in could not be started.");
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

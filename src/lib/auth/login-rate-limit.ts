import "server-only";

import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";

const WINDOW_SECONDS = 15 * 60;
const IP_LIMIT = 20;
const EMAIL_LIMIT = 8;

async function consumeDistributedLimit(
  bucketKey: string,
  limit: number,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("consume_login_rate_limit", {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: WINDOW_SECONDS,
  });

  if (error) {
    console.error("Login rate limit check failed:", error.message);
    return true;
  }

  return data === true;
}

export async function assertLoginRateLimit(email: string): Promise<void> {
  await assertLoginRateLimitByIp();

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return;
  }

  const allowed = await consumeDistributedLimit(
    `login:email:${normalizedEmail}`,
    EMAIL_LIMIT,
  );

  if (!allowed) {
    throw new Error(
      "Too many sign-in attempts for this email. Try again in a few minutes.",
    );
  }
}

export async function assertLoginRateLimitByIp(): Promise<void> {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() || headerStore.get("x-real-ip") || "unknown";

  const allowed = await consumeDistributedLimit(`login:ip:${ip}`, IP_LIMIT);

  if (!allowed) {
    throw new Error("Too many sign-in attempts. Try again in a few minutes.");
  }
}

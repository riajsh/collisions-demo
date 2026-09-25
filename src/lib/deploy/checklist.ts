import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type DeployCheckStatus = "ok" | "missing" | "warning" | "optional";

export type DeployCheckItem = {
  id: string;
  label: string;
  status: DeployCheckStatus;
  detail: string;
};

function envSet(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function resolveSiteUrl(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    return siteUrl.replace(/\/$/, "");
  }

  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercelHost) {
    const host = vercelHost.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return vercelHost.startsWith("http") ? vercelHost.replace(/\/$/, "") : `https://${host}`;
  }

  return "http://localhost:3000";
}

function supabaseProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

async function migrationsApplied(): Promise<boolean> {
  if (!envSet("NEXT_PUBLIC_SUPABASE_URL") || !envSet("SUPABASE_SERVICE_ROLE_KEY")) {
    return false;
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("calendar_accounts")
      .select("id", { head: true, count: "exact" });

    return !error;
  } catch {
    return false;
  }
}

export async function getDeployChecklist(): Promise<DeployCheckItem[]> {
  const isVercel = Boolean(process.env.VERCEL);
  const isProduction = process.env.VERCEL_ENV === "production";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const resolvedSiteUrl = resolveSiteUrl();
  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const projectRef = supabaseProjectRef();
  const authCallbackUrl = `${resolvedSiteUrl}/auth/callback`;
  const authConfirmUrl = `${resolvedSiteUrl}/auth/confirm`;
  const migrationsReady = await migrationsApplied();

  const siteUrlStatus: DeployCheckStatus = siteUrl
    ? "ok"
    : isProduction
      ? vercelHost
        ? "warning"
        : "missing"
      : vercelHost
        ? "ok"
        : "ok";

  const siteUrlDetail = siteUrl
    ? `Set to ${siteUrl}`
    : isProduction && !vercelHost
      ? "Set NEXT_PUBLIC_SITE_URL to your production domain for auth redirects."
      : vercelHost
        ? `Falls back to https://${vercelHost.replace(/^https?:\/\//, "")} via Vercel. Set NEXT_PUBLIC_SITE_URL for a custom domain.`
        : "Defaults to http://localhost:3000 in local development.";

  return [
    {
      id: "supabase-url",
      label: "NEXT_PUBLIC_SUPABASE_URL",
      status: envSet("NEXT_PUBLIC_SUPABASE_URL") ? "ok" : "missing",
      detail: envSet("NEXT_PUBLIC_SUPABASE_URL")
        ? "Supabase project URL is configured."
        : "Required — link the Supabase project.",
    },
    {
      id: "supabase-anon",
      label: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      status: envSet("NEXT_PUBLIC_SUPABASE_ANON_KEY") ? "ok" : "missing",
      detail: envSet("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        ? "Anon key is configured."
        : "Required for authenticated app requests.",
    },
    {
      id: "site-url",
      label: "NEXT_PUBLIC_SITE_URL",
      status: siteUrlStatus,
      detail: siteUrlDetail,
    },
    {
      id: "service-role",
      label: "SUPABASE_SERVICE_ROLE_KEY",
      status: envSet("SUPABASE_SERVICE_ROLE_KEY") ? "ok" : "missing",
      detail: envSet("SUPABASE_SERVICE_ROLE_KEY")
        ? "Service role key is configured (import jobs)."
        : "Required for CSV import storage and admin batch jobs.",
    },
    {
      id: "org-slug",
      label: "DEFAULT_ORG_SLUG",
      status: envSet("DEFAULT_ORG_SLUG") ? "ok" : "missing",
      detail: envSet("DEFAULT_ORG_SLUG")
        ? `Bootstrap org slug: ${process.env.DEFAULT_ORG_SLUG}`
        : "Required for first sign-in user bootstrap.",
    },
    {
      id: "supabase-auth",
      label: "Supabase Auth (Google + redirects)",
      status: "warning",
      detail: `Enable Google under Authentication → Providers, add ${authCallbackUrl} and ${authConfirmUrl} as redirect URLs, and set Site URL to ${resolvedSiteUrl}. Google OAuth redirect in Google Cloud: https://${projectRef ?? "your-project-ref"}.supabase.co/auth/v1/callback`,
    },
    {
      id: "migrations",
      label: "Database migrations",
      status: migrationsReady ? "ok" : "warning",
      detail: migrationsReady
        ? "Phase 1 schema is present on the linked Supabase project."
        : "Run supabase db push on the linked project before go-live.",
    },
    {
      id: "calendar-cron",
      label: "Calendar sync cron",
      status: isVercel ? (envSet("CRON_SECRET") ? "ok" : "warning") : "optional",
      detail: isVercel
        ? envSet("CRON_SECRET")
          ? "Scheduled daily at 03:00 UTC via vercel.json."
          : "Set CRON_SECRET before enabling the calendar-sync cron in production."
        : "Run /api/cron/calendar-sync manually or via local cron when testing.",
    },
    {
      id: "calendar-oauth",
      label: "Google Calendar OAuth",
      status:
        envSet("GOOGLE_CALENDAR_CLIENT_ID") &&
        envSet("GOOGLE_CALENDAR_CLIENT_SECRET") &&
        envSet("GOOGLE_CALENDAR_REDIRECT_URI") &&
        envSet("TOKEN_ENCRYPTION_KEY")
          ? "ok"
          : "optional",
      detail:
        envSet("GOOGLE_CALENDAR_CLIENT_ID") &&
        envSet("GOOGLE_CALENDAR_CLIENT_SECRET") &&
        envSet("GOOGLE_CALENDAR_REDIRECT_URI") &&
        envSet("TOKEN_ENCRYPTION_KEY")
          ? "Calendar OAuth and token encryption are configured."
          : "Required to connect Google Calendar from Admin.",
    },
    {
      id: "cron-secret",
      label: "CRON_SECRET",
      status: envSet("CRON_SECRET") ? "ok" : "optional",
      detail: envSet("CRON_SECRET")
        ? "Configured for future cron routes."
        : "Optional until cron jobs are enabled.",
    },
  ];
}

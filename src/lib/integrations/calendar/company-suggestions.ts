import "server-only";

import { extractEmailDomain, normaliseEmail } from "@/lib/integrations/participant-email";

const CONSUMER_EMAIL_DOMAINS = new Set([
  "aol.com",
  "fastmail.com",
  "gmail.com",
  "googlemail.com",
  "gmx.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "mac.com",
  "mail.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
  "ymail.com",
]);

export function isWorkEmailDomain(domain: string): boolean {
  const normalised = domain.trim().toLowerCase();
  return normalised.length >= 3 && !CONSUMER_EMAIL_DOMAINS.has(normalised);
}

export function workEmailDomain(email: string): string | null {
  const domain = extractEmailDomain(normaliseEmail(email));
  if (!domain || !isWorkEmailDomain(domain)) {
    return null;
  }

  return domain;
}

export function groupEmailsByWorkDomain(emails: string[]): Map<string, string[]> {
  const byDomain = new Map<string, string[]>();

  for (const email of emails) {
    const domain = workEmailDomain(email);
    if (!domain) {
      continue;
    }

    const existing = byDomain.get(domain);
    if (existing) {
      existing.push(email);
    } else {
      byDomain.set(domain, [email]);
    }
  }

  return byDomain;
}

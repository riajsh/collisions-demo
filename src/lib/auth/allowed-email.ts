import "server-only";

function loadAllowedLoginDomains(): Set<string> {
  const raw = process.env.ORG_INTERNAL_EMAIL_DOMAINS ?? "";
  return new Set(
    raw
      .split(",")
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function getPrimaryLoginDomain(): string | null {
  const domains = [...loadAllowedLoginDomains()];
  return domains[0] ?? null;
}

export function isAllowedLoginEmail(email: string): boolean {
  const allowedDomains = loadAllowedLoginDomains();
  if (allowedDomains.size === 0) {
    if (process.env.VERCEL_ENV === "production") {
      return false;
    }
    return true;
  }

  const at = email.lastIndexOf("@");
  if (at < 0) {
    return false;
  }

  const domain = email.slice(at + 1).trim().toLowerCase();
  return allowedDomains.has(domain);
}

export type OrgUserRecord = {
  id: string;
  email: string;
  fullName: string;
};

function normaliseOwnerToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveSingleOwnerRef(
  value: string,
  users: OrgUserRecord[],
): string | null {
  const raw = value.trim();
  if (!raw) {
    return null;
  }

  const lower = raw.toLowerCase();

  if (lower.includes("@")) {
    return users.find((user) => user.email.toLowerCase() === lower)?.id ?? null;
  }

  const exactName = users.find(
    (user) => user.fullName.toLowerCase() === lower,
  );
  if (exactName) {
    return exactName.id;
  }

  const normalised = normaliseOwnerToken(raw);
  const normalisedExact = users.find(
    (user) => normaliseOwnerToken(user.fullName) === normalised,
  );
  if (normalisedExact) {
    return normalisedExact.id;
  }

  const firstNameMatches = users.filter((user) => {
    const parts = user.fullName.toLowerCase().split(/\s+/);
    return parts[0] === lower || parts[0] === normalised;
  });

  if (firstNameMatches.length === 1) {
    return firstNameMatches[0].id;
  }

  return null;
}

export function resolveOrgUserId(
  value: string | undefined,
  users: OrgUserRecord[],
): string | null {
  if (!value?.trim()) {
    return null;
  }

  const segments = value
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments.length > 0 ? segments : [value.trim()]) {
    const userId = resolveSingleOwnerRef(segment, users);
    if (userId) {
      return userId;
    }
  }

  return null;
}

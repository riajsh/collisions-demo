export type ProfileCompleteness =
  | "missing-company"
  | "missing-role"
  | "missing-both";

const VALID: ProfileCompleteness[] = [
  "missing-company",
  "missing-role",
  "missing-both",
];

export function parseProfileCompleteness(
  value?: string,
): ProfileCompleteness | undefined {
  if (value && VALID.includes(value as ProfileCompleteness)) {
    return value as ProfileCompleteness;
  }

  return undefined;
}

export function applyCompletenessFilter<
  T extends {
    is(column: string, value: null): T;
    or(filters: string): T;
  },
>(query: T, complete?: ProfileCompleteness): T {
  if (!complete) {
    return query;
  }

  if (complete === "missing-company") {
    return query.or("organisation_name.is.null,organisation_name.eq.");
  }

  if (complete === "missing-role") {
    return query.or("occupation.is.null,occupation.eq.");
  }

  if (complete === "missing-both") {
    return query
      .is("organisation_name", null)
      .is("occupation", null);
  }

  return query;
}

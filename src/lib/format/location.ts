export function formatLocation(
  city: string | null,
  country: string | null,
): string | null {
  const parts = [city, country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

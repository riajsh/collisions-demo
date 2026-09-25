function capitaliseNamePart(part: string): string {
  if (!part) {
    return part;
  }

  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

function capitaliseNameToken(token: string): string {
  return token
    .split(/(['-])/)
    .map((segment) => {
      if (segment === "'" || segment === "-") {
        return segment;
      }

      return capitaliseNamePart(segment);
    })
    .join("");
}

const LAST_FIRST_COMMA_PATTERN = /^([^,]+),\s*(.+)$/;

/** "Smith, Jane" / "El Agizy, Laila" → "Jane Smith" / "Laila El Agizy". */
function flipLastFirstCommaName(name: string): string {
  const match = name.match(LAST_FIRST_COMMA_PATTERN);
  if (!match) {
    return name;
  }

  return `${match[2]!.trim()} ${match[1]!.trim()}`;
}

/** Title-case person names at write time: "john smith" → "John Smith", "o'brien" → "O'Brien". */
export function normalisePersonName(name: string | null | undefined): string {
  if (!name?.trim()) {
    return "";
  }

  const flipped = flipLastFirstCommaName(name.trim());

  return flipped
    .split(/\s+/)
    .filter(Boolean)
    .map(capitaliseNameToken)
    .join(" ");
}

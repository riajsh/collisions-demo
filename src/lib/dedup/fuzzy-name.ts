function normalizePersonName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function nameTokens(name: string): string[] {
  return normalizePersonName(name).split(" ").filter(Boolean);
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let row = 0; row < rows; row += 1) {
    matrix[row]![0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0]![col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row]![col] = Math.min(
        matrix[row - 1]![col]! + 1,
        matrix[row]![col - 1]! + 1,
        matrix[row - 1]![col - 1]! + cost,
      );
    }
  }

  return matrix[left.length]![right.length]!;
}

export function fullNameSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizePersonName(left);
  const normalizedRight = normalizePersonName(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
  const distance = levenshteinDistance(normalizedLeft, normalizedRight);
  return 1 - distance / maxLength;
}

/** Conservative fuzzy person-name match for dedup review (never auto-merge). */
export function namesAreFuzzyMatch(left: string, right: string): boolean {
  const leftTokens = nameTokens(left);
  const rightTokens = nameTokens(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false;
  }

  const leftLast = leftTokens[leftTokens.length - 1]!;
  const rightLast = rightTokens[rightTokens.length - 1]!;

  if (
    leftLast !== rightLast &&
    fullNameSimilarity(leftLast, rightLast) < 0.85
  ) {
    return false;
  }

  const leftFirst = leftTokens[0]!;
  const rightFirst = rightTokens[0]!;

  if (leftFirst === rightFirst) {
    return true;
  }

  if (leftFirst.startsWith(rightFirst) || rightFirst.startsWith(leftFirst)) {
    return true;
  }

  return fullNameSimilarity(left, right) >= 0.82;
}

/**
 * Decides whether two role/title strings say the same thing, just phrased
 * differently — "CMO" vs "Chief Marketing Officer", "Founder and CRO" vs
 * "CRO / Founder" — so that a re-sync doesn't flood the profile-update
 * review queue with pure formatting/ordering noise. Only used to decide
 * whether a change is worth a human's attention; the actual stored value is
 * never rewritten by this.
 *
 * Approach: expand any known acronym to its full words, strip punctuation
 * and filler words, then compare the two as unordered sets of words. This
 * is deliberately conservative — it only collapses cases built from the
 * same underlying words (in any order/punctuation), so a genuinely
 * different title (a real promotion or role change) still gets flagged.
 */

const ACRONYM_EXPANSIONS: Record<string, string> = {
  ceo: "chief executive officer",
  cto: "chief technology officer",
  cfo: "chief financial officer",
  coo: "chief operating officer",
  cmo: "chief marketing officer",
  cpo: "chief product officer",
  cio: "chief information officer",
  ciso: "chief information security officer",
  cro: "chief revenue officer",
  vp: "vice president",
  svp: "senior vice president",
  evp: "executive vice president",
  avp: "assistant vice president",
  hr: "human resources",
  pr: "public relations",
};

const FILLER_WORDS = new Set(["and", "the", "of", "a", "an", "for", "at", "in"]);

function normaliseToWordSet(value: string): Set<string> {
  const rawWords = value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  const words = new Set<string>();
  for (const word of rawWords) {
    if (FILLER_WORDS.has(word)) {
      continue;
    }
    const expansion = ACRONYM_EXPANSIONS[word];
    if (expansion) {
      for (const expandedWord of expansion.split(" ")) {
        words.add(expandedWord);
      }
    } else {
      words.add(word);
    }
  }
  return words;
}

export function areRoleTextsEquivalent(a: string, b: string): boolean {
  const left = normaliseToWordSet(a);
  const right = normaliseToWordSet(b);

  if (left.size === 0 || left.size !== right.size) {
    return false;
  }

  for (const word of left) {
    if (!right.has(word)) {
      return false;
    }
  }
  return true;
}

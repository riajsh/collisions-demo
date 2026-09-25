/**
 * Rule-based cleanup for free-text answers (role/job title, mostly) that
 * come through as all-caps, all-lowercase, or jumbled casing. This is a
 * fast, always-available baseline — it fixes casing, not genuine spelling
 * mistakes (see src/lib/ai/text-cleanup.ts for that).
 */

const KNOWN_ACRONYMS = new Set([
  "CEO",
  "CTO",
  "CFO",
  "COO",
  "CMO",
  "CPO",
  "CIO",
  "CISO",
  "CRO",
  "VP",
  "SVP",
  "EVP",
  "AVP",
  "HR",
  "PR",
  "IT",
  "QA",
  "UX",
  "UI",
  "API",
  "SEO",
  "SEM",
  "B2B",
  "B2C",
  "SAAS",
  "NZ",
  "US",
  "UK",
  "USA",
  "EU",
  "AI",
  "ML",
  "VC",
  "PE",
  "IPO",
  "R&D",
]);

const LOWERCASE_SMALL_WORDS = new Set([
  "of",
  "the",
  "and",
  "in",
  "for",
  "at",
  "on",
  "to",
  "a",
  "an",
]);

function capitaliseWord(word: string): string {
  if (!word) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function titleCaseWithAcronyms(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }

  const words = trimmed.split(/\s+/);

  return words
    .map((word, index) => {
      const lettersOnly = word.replace(/[^A-Za-z]/g, "");
      const upper = lettersOnly.toUpperCase();

      if (lettersOnly.length >= 2 && KNOWN_ACRONYMS.has(upper)) {
        return word.replace(lettersOnly, upper);
      }

      const lowerWord = word.toLowerCase();
      if (index > 0 && LOWERCASE_SMALL_WORDS.has(lettersOnly.toLowerCase())) {
        return lowerWord;
      }

      // Preserve hyphenated words as separate title-cased segments
      // (e.g. "co-founder" -> "Co-Founder").
      if (word.includes("-")) {
        return word
          .split("-")
          .map((segment) => capitaliseWord(segment))
          .join("-");
      }

      return capitaliseWord(word);
    })
    .join(" ");
}

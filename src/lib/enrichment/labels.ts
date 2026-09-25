import type { CompanySuggestion } from "@/lib/enrichment/company-from-email";
import type { OwnerSuggestion } from "@/lib/enrichment/owner-enrichment";

export function companySuggestionLabel(suggestion: CompanySuggestion): string {
  if (suggestion.source === "domain") {
    return "Suggested from email domain";
  }

  if (suggestion.confidence === "unanimous") {
    return "From colleagues on the same email domain";
  }

  return "Most common company on this email domain";
}

export function ownerSuggestionLabel(suggestion: OwnerSuggestion): string {
  return suggestion.reason;
}

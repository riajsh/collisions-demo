/**
 * Fixed vocabularies for the three attributes the "intelligent search"
 * feature reasons about: how senior someone is, what function they work
 * in, and what industry their company is in. Both the background
 * enrichment classifier (which tags a profile once) and the search query
 * parser (which reads what a person typed) are told to choose ONLY from
 * these lists — that's what makes matching at search time fast and exact
 * (a tag lookup) instead of fuzzy (comparing free text every search).
 *
 * If a query or a profile genuinely doesn't fit any of these, that's fine:
 * the enrichment/parsing prompts always have a fallback ("Other" or
 * leaving a field out), and search falls back to the existing keyword
 * search rather than forcing a bad match.
 */

export const SENIORITY_LEVELS = [
  "Junior",
  "Mid-level",
  "Senior",
  "Head/Director",
  "VP",
  "C-level/Founder",
] as const;

export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];

export const FUNCTIONS = [
  "Marketing",
  "Sales",
  "Operations",
  "Engineering",
  "Product",
  "Finance",
  "People/HR",
  "Legal",
  "Design",
  "Customer Success",
  "Founder/Executive",
  "Investment",
  "Other",
] as const;

export type ProfileFunction = (typeof FUNCTIONS)[number];

export const INDUSTRIES = [
  "Technology/Software",
  "Fintech",
  "Healthcare",
  "Climate/Cleantech",
  "E-commerce/Retail",
  "Media/Entertainment",
  "Professional Services",
  "Real Estate",
  "Education",
  "Manufacturing",
  "Hospitality/Travel",
  "Non-profit/Government",
  "Investment/VC",
  "Agriculture",
  "Other",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

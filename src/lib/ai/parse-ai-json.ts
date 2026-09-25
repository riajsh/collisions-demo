import "server-only";

/**
 * Claude sometimes wraps a JSON reply in a ```json ... ``` markdown code
 * fence even when explicitly told to respond with only the JSON itself.
 * Every AI call in this project was silently falling back to its rough
 * rule-based guess on every single request because of exactly this —
 * the response was genuinely valid JSON once you strip the fence, but
 * JSON.parse() on the raw text failed every time, so the catch block
 * kicked in and used the fallback instead. This strips that fencing
 * (if present) before parsing.
 *
 * Calls that involve tool use (e.g. web search) make this worse — Claude
 * tends to narrate its reasoning ("Based on the search results, here's my
 * classification: {...}") instead of returning bare JSON, even when told
 * not to. If the cleaned text still isn't valid JSON on its own, this
 * falls back to extracting just the substring between the first "{" and
 * the last "}" and parsing that instead of giving up.
 */
export function parseAiJsonResponse(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw firstError;
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

import "server-only";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

export type NoteForSummary = {
  eventTitle: string;
  /** ISO date string. */
  date: string;
  text: string;
};

function buildPrompt(notes: NoteForSummary[]): string {
  const formatted = notes
    .map((note) => `- (${note.date.slice(0, 10)}, ${note.eventTitle}) ${note.text}`)
    .join("\n");

  return [
    "You're helping a relationship-management team member quickly get up to speed on someone before reaching out.",
    "Below are free-text answers this person gave on event registration forms over time, oldest to newest — things like what they're working on, their role, or challenges they mentioned.",
    "Write a short, insightful summary (2-4 sentences) a team member could read in a few seconds before a call or email. Focus on what's actually useful: notable changes over time (e.g. a new role), recurring themes, anything that hints at what they might need or care about right now. Skip generic filler and don't just restring the notes together — genuinely synthesise them.",
    "Respond with ONLY the summary text — no preamble, no quotation marks, no markdown formatting.",
    "",
    formatted,
  ].join("\n");
}

/**
 * On-demand, user-triggered summary of a profile's self-reported event
 * notes — unlike the Eventbrite sync's AI calls (text-cleanup.ts,
 * split-company-role.ts), this one is fine to throw on failure: it's called
 * from a button click, not a background sync, so the caller can show the
 * real error directly to whoever clicked it rather than needing a silent
 * fallback.
 */
export async function summarizeNotes(notes: NoteForSummary[]): Promise<string> {
  if (notes.length === 0) {
    throw new Error("No notes to summarise yet.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("AI summaries aren't set up yet — no Anthropic API key configured.");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      messages: [{ role: "user", content: buildPrompt(notes) }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API returned ${response.status}`);
  }

  const data = await response.json();
  const text: string = data?.content?.[0]?.text ?? "";
  const summary = text.trim();

  if (!summary) {
    throw new Error("AI returned an empty summary — try again.");
  }

  return summary;
}

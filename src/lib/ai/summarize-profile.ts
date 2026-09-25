import "server-only";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

export type ProfileSummaryActivity = {
  type: string;
  title: string;
  summary: string | null;
  /** ISO date string. */
  date: string;
};

export type ProfileSummaryEvent = {
  title: string;
  /** ISO date string. */
  date: string;
};

export type ProfileSummaryInput = {
  fullName: string;
  occupation: string | null;
  organisationName: string | null;
  bio: string | null;
  relationshipContext: string | null;
  tags: string[];
  /** Self-reported answers from event forms, oldest to newest. */
  notes: Array<{ eventTitle: string; date: string; text: string }>;
  /** Direct contact / logged interactions, oldest to newest. */
  activities: ProfileSummaryActivity[];
  /** Events attended, oldest to newest. */
  events: ProfileSummaryEvent[];
};

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function buildPrompt(input: ProfileSummaryInput): string {
  const lines: string[] = [
    "You're helping a relationship-management team member quickly get up to speed on someone before reaching out.",
    "Write a short, insightful \"where things stand\" summary (3-5 sentences) a team member could read in a few seconds before a call or email.",
    "Focus on what's actually useful: who they are, notable changes over time (e.g. a new role), recurring themes, the state of the relationship, and anything that hints at what they might need, care about, or what a good next step would be.",
    "Skip generic filler and don't just restate the facts one by one — genuinely synthesise them into a coherent read on this person.",
    "Respond with ONLY the summary text — no preamble, no quotation marks, no markdown formatting, no headings.",
    "",
    `Name: ${input.fullName}`,
  ];

  const roleLine = [input.occupation, input.organisationName].filter(Boolean).join(" at ");
  if (roleLine) {
    lines.push(`Role: ${roleLine}`);
  }
  if (input.tags.length > 0) {
    lines.push(`Tags: ${input.tags.join(", ")}`);
  }
  if (input.bio) {
    lines.push(`Bio: ${input.bio}`);
  }
  if (input.relationshipContext) {
    lines.push(`Our own notes on this relationship: ${input.relationshipContext}`);
  }

  if (input.events.length > 0) {
    lines.push("", "Events attended (oldest to newest):");
    for (const event of input.events) {
      lines.push(`- (${formatDate(event.date)}) ${event.title}`);
    }
  }

  if (input.activities.length > 0) {
    lines.push("", "Logged interactions (oldest to newest):");
    for (const activity of input.activities) {
      const detail = activity.summary ? `: ${activity.summary}` : "";
      lines.push(`- (${formatDate(activity.date)}, ${activity.type}) ${activity.title}${detail}`);
    }
  }

  if (input.notes.length > 0) {
    lines.push("", "What they've told us themselves on event forms (oldest to newest):");
    for (const note of input.notes) {
      lines.push(`- (${formatDate(note.date)}, ${note.eventTitle}) ${note.text}`);
    }
  }

  return lines.join("\n");
}

/**
 * On-demand, user-triggered summary of an entire profile — role, bio, our
 * own relationship notes, logged interactions, and self-reported event
 * notes all synthesised into one "where things stand" read. Supersedes the
 * narrower summarizeNotes (which only covered self-reported event-form
 * answers): this is now the single consolidated summary shown near the top
 * of a profile, so it draws on everything we know rather than one slice of
 * it. Throws on failure since it's called from a button click, not a
 * background sync — the caller can show the real error to whoever clicked.
 */
export async function summarizeProfile(input: ProfileSummaryInput): Promise<string> {
  const hasAnySignal =
    input.notes.length > 0 || input.activities.length > 0 || input.events.length > 0;

  if (!hasAnySignal) {
    throw new Error("Not enough activity on this profile to summarise yet.");
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
      messages: [{ role: "user", content: buildPrompt(input) }],
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

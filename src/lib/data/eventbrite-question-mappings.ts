import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getOrgId, requireAdmin } from "@/lib/auth/session";
import { getDecryptedEventbriteToken } from "@/lib/data/eventbrite-accounts";
import { listEventQuestions } from "@/lib/integrations/eventbrite/client";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type MappableField =
  | "role"
  | "company"
  | "company_size"
  | "phone"
  | "company_and_role"
  | "note"
  | "ignore";

export type QuestionMappingRow = {
  eventbriteQuestionId: string;
  questionText: string;
  targetField: MappableField;
  /** True when this field wasn't explicitly saved for this event yet — it's
   * a suggestion carried over from a previous event that asked the same
   * question, offered as a starting point rather than applied automatically.
   * Saving the mapping (even unchanged) confirms it for this event. */
  suggested: boolean;
};

function normaliseQuestionText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export type QuestionMappingList = {
  connected: boolean;
  questions: QuestionMappingRow[];
};

/**
 * Lists an event's Eventbrite registration questions, cross-referenced with
 * any mapping already saved for it (defaulting unmapped ones to "ignore").
 * Powers the one-time "map this event's questions" screen.
 */
export async function listQuestionMappingsForEvent(
  linkedEventId: string,
): Promise<QuestionMappingList> {
  const orgId = await getOrgId();
  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, eventbrite_event_id")
    .eq("id", linkedEventId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (eventError) {
    throw new Error(`Failed to load event: ${eventError.message}`);
  }
  if (!event?.eventbrite_event_id) {
    return { connected: false, questions: [] };
  }

  const token = await getDecryptedEventbriteToken(orgId);
  if (!token) {
    return { connected: false, questions: [] };
  }

  const [questions, { data: savedMappings, error: mappingError }, { data: priorMappings, error: priorError }] =
    await Promise.all([
      listEventQuestions(token, event.eventbrite_event_id),
      supabase
        .from("eventbrite_question_mappings")
        .select("eventbrite_question_id, target_field")
        .eq("org_id", orgId)
        .eq("event_id", linkedEventId),
      // Every other event's saved (non-"ignore") mappings, most recent
      // first — used to suggest a starting point for a question this event
      // hasn't been mapped yet but a previous event already answered the
      // same way (Jordan expects most events to ask "more or less the same"
      // questions, so this saves re-doing the same decision 40+ times).
      supabase
        .from("eventbrite_question_mappings")
        .select("question_text, target_field, updated_at")
        .eq("org_id", orgId)
        .neq("event_id", linkedEventId)
        .neq("target_field", "ignore")
        .order("updated_at", { ascending: false }),
    ]);

  if (mappingError) {
    throw new Error(`Failed to load saved mappings: ${mappingError.message}`);
  }
  if (priorError) {
    throw new Error(`Failed to load prior mappings: ${priorError.message}`);
  }

  const savedByQuestionId = new Map(
    (savedMappings ?? []).map((row) => [row.eventbrite_question_id, row.target_field]),
  );

  const suggestionByText = new Map<string, MappableField>();
  for (const row of priorMappings ?? []) {
    const key = normaliseQuestionText(row.question_text);
    if (!suggestionByText.has(key)) {
      suggestionByText.set(key, row.target_field as MappableField);
    }
  }

  return {
    connected: true,
    questions: questions.map((question) => {
      const saved = savedByQuestionId.get(question.id) as MappableField | undefined;
      if (saved) {
        return {
          eventbriteQuestionId: question.id,
          questionText: question.text,
          targetField: saved,
          suggested: false,
        };
      }

      const suggestion = suggestionByText.get(normaliseQuestionText(question.text));
      return {
        eventbriteQuestionId: question.id,
        questionText: question.text,
        targetField: suggestion ?? "ignore",
        suggested: Boolean(suggestion),
      };
    }),
  };
}

export async function saveQuestionMappings(
  linkedEventId: string,
  mappings: Array<{
    eventbriteQuestionId: string;
    questionText: string;
    targetField: MappableField;
  }>,
): Promise<void> {
  await requireAdmin();
  const orgId = await getOrgId();
  const supabase = await createClient();

  const rows = mappings.map((mapping) => ({
    org_id: orgId,
    event_id: linkedEventId,
    eventbrite_question_id: mapping.eventbriteQuestionId,
    question_text: mapping.questionText,
    target_field: mapping.targetField,
  }));

  const { error } = await supabase
    .from("eventbrite_question_mappings")
    .upsert(rows, { onConflict: "org_id,event_id,eventbrite_question_id" });

  if (error) {
    throw new Error(`Failed to save question mappings: ${error.message}`);
  }
}

/**
 * Quick lookup used by the sync engine: eventbrite_question_id -> target
 * field, excluding anything mapped to "ignore".
 */
export async function loadQuestionFieldMapForSync(
  supabase: SupabaseClient<Database>,
  orgId: string,
  eventId: string,
): Promise<Map<string, MappableField>> {
  const { data, error } = await supabase
    .from("eventbrite_question_mappings")
    .select("eventbrite_question_id, target_field")
    .eq("org_id", orgId)
    .eq("event_id", eventId)
    .neq("target_field", "ignore");

  if (error) {
    throw new Error(`Failed to load question mappings: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((row) => [
      row.eventbrite_question_id,
      row.target_field as MappableField,
    ]),
  );
}

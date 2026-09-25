"use client";

import { useState } from "react";

import {
  loadQuestionMappingsAction,
  saveQuestionMappingsAction,
} from "@/app/(app)/admin/eventbrite/actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MappableField, QuestionMappingRow } from "@/lib/data/eventbrite-question-mappings";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";

const FIELD_OPTIONS: Array<{ value: MappableField; label: string }> = [
  { value: "ignore", label: "Don't use" },
  { value: "role", label: "Role" },
  { value: "company", label: "Company" },
  { value: "company_and_role", label: "Company & role (combined)" },
  { value: "company_size", label: "Company size" },
  { value: "phone", label: "Phone" },
  { value: "note", label: "Note (adds to their profile timeline)" },
];

export function EventbriteQuestionMappingPanel({
  linkedEventId,
}: {
  linkedEventId: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<QuestionMappingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isPending, run } = useAsyncAction();

  async function handleOpen() {
    setOpen(true);
    if (questions !== null) {
      return;
    }
    setLoading(true);
    setError(null);
    const { result, error: loadError } = await loadQuestionMappingsAction(linkedEventId);
    setLoading(false);
    if (loadError || !result) {
      setError(loadError ?? "Failed to load questions");
      return;
    }
    if (!result.connected) {
      setError("Couldn't load this event's registration questions from Eventbrite.");
      return;
    }
    setQuestions(result.questions);
  }

  function updateField(questionId: string, targetField: MappableField) {
    setQuestions((current) =>
      current
        ? current.map((question) =>
            question.eventbriteQuestionId === questionId
              ? { ...question, targetField, suggested: false }
              : question,
          )
        : current,
    );
  }

  function handleSave() {
    if (!questions) {
      return;
    }
    void run(async () => {
      setError(null);
      const result = await saveQuestionMappingsAction(linkedEventId, questions);
      if (result.error) {
        setError(result.error);
        return;
      }
      toastSuccess("Saved");
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={handleOpen}>
        Map registration questions
      </Button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-caption text-muted-foreground">
        If this event&apos;s registration form asked for role, company,
        company size, or phone as their own separate questions, match them
        here — answers will fill those fields on each attendee&apos;s
        profile. If one question asks for company and role together in a
        single answer instead, use &quot;Company &amp; role (combined)&quot;
        and it&apos;ll be split into both fields automatically. For an
        open-ended question (like &quot;what are you struggling with right
        now?&quot;), use &quot;Note&quot; — each answer gets added as its own
        dated entry in that attendee&apos;s profile timeline, tagged to this
        event, rather than filling in a profile field.
      </p>

      {loading ? (
        <p className="text-caption text-muted-foreground">Loading questions…</p>
      ) : error ? (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : questions && questions.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          This event has no custom registration questions.
        </p>
      ) : questions ? (
        <div className="space-y-2">
          {questions.some((question) => question.suggested) ? (
            <p className="text-caption text-muted-foreground">
              Fields marked <span className="italic">(suggested)</span> were
              carried over from a previous event that asked the same
              question — check they look right, then save to confirm them
              for this event too.
            </p>
          ) : null}
          {questions.map((question) => (
            <div
              key={question.eventbriteQuestionId}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="flex-1 text-body text-foreground">
                {question.questionText}
                {question.suggested ? (
                  <span className="ml-1.5 text-caption text-muted-foreground italic">
                    (suggested)
                  </span>
                ) : null}
              </span>
              <Select
                value={question.targetField}
                onValueChange={(value) =>
                  updateField(question.eventbriteQuestionId, value as MappableField)
                }
              >
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {questions && questions.length > 0 ? (
          <Button type="button" size="sm" disabled={isPending} onClick={handleSave}>
            {isPending ? "Saving…" : "Save mapping"}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </div>
  );
}

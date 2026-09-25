"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { uploadImportAction } from "@/app/(app)/profiles/import/actions";
import { IMPORT_SOURCES } from "@/lib/import/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EventOption = {
  id: string;
  title: string;
};

type ImportUploadFormProps = {
  events: EventOption[];
};

export function ImportUploadForm({ events }: ImportUploadFormProps) {
  const router = useRouter();
  const [source, setSource] = useState<string>("csv");
  const [eventChoice, setEventChoice] = useState("none");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setIsSubmitting(true);

    try {
      formData.set("source", source);
      const result = await uploadImportAction(formData);

      if (result?.error) {
        setError(result.error);
        return;
      }

      if (result?.importId) {
        router.push(`/profiles/import/${result.importId}`);
        router.refresh();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div className="space-y-2">
        <Label htmlFor="source">Source</Label>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger id="source" className="w-full max-w-xs">
            <SelectValue placeholder="Select source" />
          </SelectTrigger>
          <SelectContent>
            {IMPORT_SOURCES.map((option) => (
              <SelectItem key={option} value={option} className="capitalize">
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="file">CSV file</Label>
        <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
        <p className="text-caption text-muted-foreground">
          CSV only. Max 10 MB and 5,000 rows. Column mapping and duplicate
          checking happen automatically after upload.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
        <div className="space-y-2">
          <Label htmlFor="upload-event-choice">Connect these people to an event (optional)</Label>
          <Select value={eventChoice} onValueChange={setEventChoice}>
            <SelectTrigger id="upload-event-choice" className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No event</SelectItem>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.title}
                </SelectItem>
              ))}
              <SelectItem value="new">+ Create new event</SelectItem>
            </SelectContent>
          </Select>
          <input
            type="hidden"
            name="eventId"
            value={eventChoice === "none" || eventChoice === "new" ? "" : eventChoice}
          />
        </div>

        {eventChoice === "new" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-upload-event-title">Event name</Label>
              <Input id="new-upload-event-title" name="newEventTitle" placeholder="e.g. Risk-Reward Equation breakfast" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-upload-event-date">Event date</Label>
              <Input id="new-upload-event-date" name="newEventDate" type="date" />
            </div>
          </div>
        ) : null}

        <p className="text-caption text-muted-foreground">
          Everyone in this file will be linked as an attendee of this event and
          tagged with its name once the import completes. You can also change
          this later, before you click Complete.
        </p>
      </div>

      {error ? (
        <p className="text-body text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Uploading & checking…" : "Upload"}
      </Button>
    </form>
  );
}

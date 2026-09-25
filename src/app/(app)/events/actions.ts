"use server";

import { revalidatePath } from "next/cache";

import {
  addEventAttendee,
  addEventAttendeesBulk,
  createEvent,
  deleteEvent,
  markEventAttendeeAttended,
  removeEventAttendee,
  updateEvent,
} from "@/lib/data/events";
import { inferCoAttendanceForEvent } from "@/lib/computed/infer-connections";
import { searchProfilesForPicker } from "@/lib/data/profiles";
import {
  addEventAttendeeSchema,
  addEventAttendeesBulkSchema,
  createEventSchema,
  deleteEventSchema,
  markEventAttendeeAttendedSchema,
  removeEventAttendeeSchema,
  updateEventSchema,
} from "@/lib/validators/events";

function revalidateEvents(eventId?: string) {
  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath("/search");
  revalidatePath("/profiles");
  if (eventId) {
    revalidatePath(`/events/${eventId}`);
  }
}

export async function createEventAction(formData: FormData) {
  const parsed = createEventSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    eventType: formData.get("eventType"),
    eventDate: formData.get("eventDate"),
    location: formData.get("location") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const event = await createEvent(parsed.data);
    revalidateEvents(event.id);
    return { success: true as const, eventId: event.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to create event",
    };
  }
}

export async function updateEventAction(formData: FormData) {
  const parsed = updateEventSchema.safeParse({
    eventId: formData.get("eventId"),
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    eventType: formData.get("eventType"),
    eventDate: formData.get("eventDate"),
    location: formData.get("location") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await updateEvent(parsed.data);
    revalidateEvents(parsed.data.eventId);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to update event",
    };
  }
}

export async function addEventAttendeeAction(formData: FormData) {
  const parsed = addEventAttendeeSchema.safeParse({
    eventId: formData.get("eventId"),
    profileId: formData.get("profileId"),
    attended: formData.get("attended") ?? "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await addEventAttendee(parsed.data);
    revalidateEvents(parsed.data.eventId);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to add attendee",
    };
  }
}

export async function addEventAttendeesBulkAction(formData: FormData) {
  const parsed = addEventAttendeesBulkSchema.safeParse({
    eventId: formData.get("eventId"),
    profileIds: formData.getAll("profileIds"),
    tagWithEvent: formData.get("tagWithEvent") ?? "false",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const result = await addEventAttendeesBulk(parsed.data);
    revalidateEvents(parsed.data.eventId);
    return { success: true as const, ...result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to add attendees",
    };
  }
}

export async function removeEventAttendeeAction(formData: FormData) {
  const parsed = removeEventAttendeeSchema.safeParse({
    eventId: formData.get("eventId"),
    profileId: formData.get("profileId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await removeEventAttendee(parsed.data.eventId, parsed.data.profileId);
    revalidateEvents(parsed.data.eventId);
    return { success: true as const };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to remove attendee",
    };
  }
}

export async function markEventAttendeeAttendedAction(formData: FormData) {
  const parsed = markEventAttendeeAttendedSchema.safeParse({
    eventId: formData.get("eventId"),
    profileId: formData.get("profileId"),
    attended: formData.get("attended"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await markEventAttendeeAttended(
      parsed.data.eventId,
      parsed.data.profileId,
      parsed.data.attended,
    );
    revalidateEvents(parsed.data.eventId);
    return { success: true as const };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to update attendance",
    };
  }
}

export async function deleteEventAction(formData: FormData) {
  const parsed = deleteEventSchema.safeParse({
    eventId: formData.get("eventId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await deleteEvent(parsed.data.eventId);
    revalidateEvents();
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to delete event",
    };
  }
}

export async function searchProfilesForPickerAction(query: string) {
  try {
    const results = await searchProfilesForPicker(query);
    return { results };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to search profiles",
      results: [],
    };
  }
}

export async function inferCoAttendanceAction(formData: FormData) {
  const eventId = formData.get("eventId");
  if (typeof eventId !== "string" || !/^[0-9a-f-]{36}$/i.test(eventId)) {
    return { error: "Invalid event ID", created: 0, skipped: 0 };
  }

  try {
    const result = await inferCoAttendanceForEvent(eventId);
    revalidateEvents(eventId);
    revalidatePath("/profiles");
    revalidatePath("/connect");
    return { success: true as const, ...result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to infer connections",
      created: 0,
      skipped: 0,
    };
  }
}

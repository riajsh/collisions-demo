/*
 * Adds a "note" question-mapping target. Unlike role/company/company
 * size/phone, a "note"-mapped answer doesn't fill in a profile field — it's
 * an open-ended answer (e.g. "what are you struggling with right now?")
 * that becomes its own dated entry on the attendee's profile timeline,
 * tagged to the event it came from. See src/lib/integrations/eventbrite/
 * sync.ts and src/lib/data/eventbrite-reviews.ts.
 */

alter table public.eventbrite_question_mappings
  drop constraint eventbrite_question_mappings_target_field_check;

alter table public.eventbrite_question_mappings
  add constraint eventbrite_question_mappings_target_field_check
  check (target_field in ('role', 'company', 'company_size', 'phone', 'company_and_role', 'note', 'ignore'));

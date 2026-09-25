/*
 * Some events ask "What's your company & role?" as a single combined
 * question instead of two separate ones. Adds a new question-mapping target
 * ("company_and_role") so that one answer can be split into both the Role
 * and Company profile fields — the actual splitting logic lives in the app
 * (src/lib/ai/split-company-role.ts), this just widens the allowed value.
 */

alter table public.eventbrite_question_mappings
  drop constraint eventbrite_question_mappings_target_field_check;

alter table public.eventbrite_question_mappings
  add constraint eventbrite_question_mappings_target_field_check
  check (target_field in ('role', 'company_size', 'phone', 'company_and_role', 'ignore'));

/*
 * Adds a standalone "company" question-mapping target, for events that ask
 * for company name as its own separate registration question (as opposed to
 * "company_and_role", which is for a single combined question that needs
 * splitting). A "company"-mapped answer fills the organisation_name profile
 * field directly — see src/lib/integrations/eventbrite/sync.ts.
 */

alter table public.eventbrite_question_mappings
  drop constraint eventbrite_question_mappings_target_field_check;

alter table public.eventbrite_question_mappings
  add constraint eventbrite_question_mappings_target_field_check
  check (target_field in ('role', 'company', 'company_size', 'phone', 'company_and_role', 'ignore'));

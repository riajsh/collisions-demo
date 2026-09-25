/*
 * One-time data fix: Eventbrite has had a bug since its 2026 ownership
 * change where some attendee names come through as Python "bytes" reprs
 * instead of plain text — e.g. "b'Eva' b'Kulkarni'" instead of
 * "Eva Kulkarni". The app itself now strips this on every future sync
 * (src/lib/integrations/eventbrite/client.ts), but rows already pulled in
 * before that fix need a one-time cleanup.
 */

update public.eventbrite_attendee_reviews
set display_name = regexp_replace(display_name, 'b([''"])(.*?)\1', '\2', 'g')
where display_name ~ 'b[''"]';

update public.eventbrite_attendee_reviews
set ticket_type = regexp_replace(ticket_type, 'b([''"])(.*?)\1', '\2', 'g')
where ticket_type ~ 'b[''"]';

/*
 * One-time cleanup: Eventbrite shows a literal "Info Requested" placeholder
 * name/email for additional attendees on a group ticket who haven't filled
 * in their own registration details yet. Before the sync code started
 * filtering these out (see client.ts normaliseAttendeeEmail), they were
 * queued as ordinary review rows — this clears out any already sitting in
 * the queue. Nothing else is affected; real attendees are untouched.
 */

update public.eventbrite_attendee_reviews
set status = 'ignored',
    reviewed_at = now()
where status = 'pending'
  and (
    lower(email) = 'info requested'
    or lower(display_name) like '%info requested%'
  );

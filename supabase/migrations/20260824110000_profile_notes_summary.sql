alter table public.profiles
  add column notes_summary text,
  add column notes_summary_generated_at timestamptz,
  add column notes_summary_note_count integer;

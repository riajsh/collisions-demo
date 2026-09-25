/*
 * Narrow tags.category to the three categories the team actually uses:
 * Expertise, Industry, Signal/Influence — replacing the original
 * sector / role / interest / other placeholders from the Phase 1 build.
 *
 * Existing rows (if any) are remapped to the closest new category first
 * so the new check constraint doesn't reject them:
 *   sector   -> industry
 *   role     -> expertise
 *   interest -> signal_influence
 *   other    -> expertise (fallback)
 */

update public.tags set category = 'industry' where category = 'sector';
update public.tags set category = 'expertise' where category = 'role';
update public.tags set category = 'signal_influence' where category = 'interest';
update public.tags set category = 'expertise' where category = 'other';

alter table public.tags drop constraint tags_category_check;

alter table public.tags
  alter column category set default 'expertise';

alter table public.tags
  add constraint tags_category_check
    check (category in ('expertise', 'industry', 'signal_influence'));

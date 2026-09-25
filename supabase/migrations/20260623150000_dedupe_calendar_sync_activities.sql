/*
 * Remove duplicate calendar_sync activities created before cross-calendar dedup.
 * Legacy rows used google_event_id as source_ref; newer rows use ical_uid#start_at.
 */

delete from public.activities
where source = 'calendar_sync'
  and id in (
    select id
    from (
      select
        id,
        row_number() over (
          partition by org_id, profile_id, activity_date, title
          order by
            case when source_ref like '%#%' then 0 else 1 end,
            created_at asc,
            id asc
        ) as row_num
      from public.activities
      where source = 'calendar_sync'
        and title is not null
    ) duplicates
    where row_num > 1
  );

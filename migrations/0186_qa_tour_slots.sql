-- Bookable visit slots on the hidden QA centre only.
-- The centre stays admin_only / is_test / is_demo. This does not publish it.
-- Undo: delete from tour_windows where daycare_id = 'qa-reviewer-demo' and id like 'qa-tour-%';

insert into tour_windows (
  id, daycare_id, window_date, start_time, end_time, capacity, timezone, start_at, end_at
)
select
  'qa-tour-' || to_char(day, 'YYYYMMDD'),
  'qa-reviewer-demo',
  day,
  '10:00',
  '10:30',
  2,
  'America/Winnipeg',
  (day::timestamp + time '10:00') at time zone 'America/Winnipeg',
  (day::timestamp + time '10:30') at time zone 'America/Winnipeg'
from (
  select day
  from (
    select (current_date + offs)::date as day
    from generate_series(1, 21) as offs
  ) days
  where extract(dow from day) not in (0, 6)
  order by day
  limit 4
) picked
where exists (select 1 from daycares where id = 'qa-reviewer-demo')
on conflict (daycare_id, window_date, start_time) do nothing;

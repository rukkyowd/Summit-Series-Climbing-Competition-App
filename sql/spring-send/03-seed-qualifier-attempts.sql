insert into public.qualifier_attempts (
  competition_id,
  climber_id,
  climb_number,
  attempt_count,
  topped,
  entered_by
)
select
  climbers.competition_id,
  climbers.id,
  climbs.climb_number,
  1 + ((climbers.climber_number::int * climbs.climb_number) % 4),
  ((climbers.climber_number::int + climbs.climb_number) % 3) <> 0,
  case when climbs.climb_number <= 8 then 'climber' else 'staff' end
from public.climbers
cross join generate_series(1, 20) as climbs(climb_number)
where climbs.climb_number <= 5 + ((climbers.climber_number::int * 3) % 16);

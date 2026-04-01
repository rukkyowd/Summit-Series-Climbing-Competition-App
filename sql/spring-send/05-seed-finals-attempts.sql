insert into public.final_attempts (
  competition_id,
  climber_id,
  climb_number,
  top,
  zone,
  attempts_to_top,
  attempts_to_zone,
  entered_by
)
select
  finalists.competition_id,
  finalists.climber_id,
  climbs.climb_number,
  ((finalists.qualifier_rank + climbs.climb_number) % 3) <> 0,
  true,
  1 + ((finalists.qualifier_rank + climbs.climb_number) % 4),
  1 + ((finalists.qualifier_rank + climbs.climb_number) % 5),
  'staff'
from public.competition_finalists finalists
cross join generate_series(1, 4) as climbs(climb_number)
where finalists.competition_id = (select id from public.competitions where slug = 'spring-send-youth-competitive');

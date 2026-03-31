with athlete_profiles as (
  select
    c.id,
    c.climber_number::int as athlete_number,
    6 + ((c.climber_number::int * 23) % 13) as strength_band,
    1 + ((c.climber_number::int * 29) % 6) as endurance_band,
    (c.climber_number::int * 31) % 8 as volatility_band
  from public.climbers c
  where c.event_id = 1
),
qualifier_attempt_seed as (
  select
    profiles.id as climber_id,
    profiles.athlete_number,
    profiles.strength_band,
    profiles.endurance_band,
    profiles.volatility_band,
    climbs.climb_number,
    least(20, 5 + ((profiles.athlete_number * 37) % 16)) as max_logged_climb,
    profiles.strength_band + ((profiles.athlete_number * 41 + climbs.climb_number * 43) % 12) as success_score,
    5 + floor((climbs.climb_number - 1) / 2.0)::int + ((climbs.climb_number * 47 + profiles.volatility_band * 53) % 8) as difficulty_score
  from athlete_profiles profiles
  cross join generate_series(1, 20) as climbs(climb_number)
),
qualifier_attempt_rows as (
  select
    climber_id,
    climb_number,
    success_score >= difficulty_score as topped,
    case
      when success_score >= difficulty_score
        then 1 + ((athlete_number * 59 + climb_number * 61 + volatility_band * 67) % (2 + least(3, endurance_band)))
      else 1 + ((athlete_number * 71 + climb_number * 73 + endurance_band * 79) % (4 + (volatility_band % 4)))
    end as attempt_count,
    case
      when climb_number <= 8 or ((athlete_number * 83 + climb_number * 89) % 3 = 0) then 'climber'
      else 'staff'
    end as entered_by
  from qualifier_attempt_seed
  where climb_number <= max_logged_climb
    and not (climb_number > 12 and ((athlete_number * 97 + climb_number * 101) % 5) = 0)
)
insert into public.qualifier_attempts (
  event_id,
  climber_id,
  climb_number,
  attempt_count,
  topped,
  entered_by
)
select
  1,
  rows.climber_id,
  rows.climb_number,
  rows.attempt_count,
  rows.topped,
  rows.entered_by
from qualifier_attempt_rows rows;

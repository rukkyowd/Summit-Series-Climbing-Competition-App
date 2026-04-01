with athlete_profiles as (
  select
    c.id as climber_id,
    c.competition_id,
    c.climber_number::int as athlete_number,
    c.age_group,
    c.gender_division,
    case c.age_group
      when 'Open' then 16
      when 'Masters' then 13
      when 'Rec' then 9
      when 'Junior' then 14
      when 'Youth A' then 13
      when 'Youth B' then 12
      when 'Youth C' then 10
      else 11
    end
      + case c.gender_division when 'Men' then 2 when 'Women' then 1 else 0 end
      + ((c.climber_number::int * 29) % 5) as strength_band,
    1 + ((c.climber_number::int * 31) % 6) as endurance_band,
    (c.climber_number::int * 37) % 8 as volatility_band
  from public.climbers c
  where c.competition_id in (
    select id
    from public.competitions
    where slug in ('spring-send-recreational', 'spring-send-youth-competitive')
  )
),
qualifier_attempt_seed as (
  select
    profiles.competition_id,
    profiles.climber_id,
    profiles.athlete_number,
    profiles.age_group,
    profiles.strength_band,
    profiles.endurance_band,
    profiles.volatility_band,
    climbs.climb_number,
    case
      when profiles.age_group = 'Rec' then least(20, 4 + ((profiles.athlete_number * 41) % 12))
      when profiles.age_group = 'Masters' then least(20, 6 + ((profiles.athlete_number * 43) % 11))
      else least(20, 8 + ((profiles.athlete_number * 47) % 13))
    end as max_logged_climb,
    profiles.strength_band
      + ((profiles.athlete_number * 53 + climbs.climb_number * 59 + profiles.volatility_band * 61) % 11) as success_score,
    case
      when profiles.competition_id = (select id from public.competitions where slug = 'spring-send-recreational')
        then 4 + floor((climbs.climb_number - 1) / 3.0)::int + ((climbs.climb_number * 67 + profiles.volatility_band * 71) % 6)
      else 6 + floor((climbs.climb_number - 1) / 2.0)::int + ((climbs.climb_number * 73 + profiles.volatility_band * 79) % 7)
    end as difficulty_score
  from athlete_profiles profiles
  cross join generate_series(1, 20) as climbs(climb_number)
),
qualifier_attempt_rows as (
  select
    competition_id,
    climber_id,
    climb_number,
    case
      when competition_id = (select id from public.competitions where slug = 'spring-send-recreational')
        then success_score >= difficulty_score
      else success_score >= difficulty_score - 2
    end as zone,
    success_score >= difficulty_score as topped,
    case
      when success_score >= difficulty_score
        then 1 + ((athlete_number * 83 + climb_number * 89 + volatility_band * 97) % (2 + least(3, endurance_band)))
      else 1 + ((athlete_number * 101 + climb_number * 103 + endurance_band * 107) % (4 + (volatility_band % 4)))
    end as attempt_count,
    case
      when success_score >= difficulty_score
        then 1 + ((athlete_number * 149 + climb_number * 151 + volatility_band * 157) % (2 + least(3, endurance_band)))
      else null
    end as raw_top_attempts,
    case
      when competition_id = (select id from public.competitions where slug = 'spring-send-recreational')
        then case when success_score >= difficulty_score then 1 + ((athlete_number * 163 + climb_number * 167) % 3) else null end
      when success_score >= difficulty_score - 2
        then 1 + ((athlete_number * 173 + climb_number * 179 + endurance_band) % (3 + (volatility_band % 3)))
      else null
    end as raw_zone_attempts,
    case
      when competition_id = (select id from public.competitions where slug = 'spring-send-recreational')
        and (climb_number <= 10 or ((athlete_number * 109 + climb_number * 113) % 4) <> 0)
        then 'climber'
      when (athlete_number * 127 + climb_number * 131) % 3 = 0
        then 'climber'
      else 'staff'
    end as entered_by
  from qualifier_attempt_seed
  where climb_number <= max_logged_climb
    and not (
      climb_number > 11
      and ((athlete_number * 137 + climb_number * 139 + volatility_band) % 5) = 0
    )
)
insert into public.qualifier_attempts (
  competition_id,
  climber_id,
  climb_number,
  attempt_count,
  zone,
  topped,
  attempts_to_top,
  attempts_to_zone,
  entered_by
)
select
  rows.competition_id,
  rows.climber_id,
  rows.climb_number,
  rows.attempt_count,
  rows.zone or rows.topped,
  rows.topped,
  case
    when rows.topped
      then greatest(1, rows.raw_top_attempts)
    else null
  end,
  case
    when rows.zone or rows.topped
      then case
        when rows.topped
          then least(greatest(1, rows.raw_zone_attempts), greatest(1, rows.raw_top_attempts))
        else greatest(1, rows.raw_zone_attempts)
      end
    else null
  end,
  rows.entered_by
from qualifier_attempt_rows rows;

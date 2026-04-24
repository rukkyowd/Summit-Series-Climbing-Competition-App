with athlete_profiles as (
  select
    c.id as climber_id,
    c.competition_id,
    c.climber_number::int as athlete_number,
    c.age_group,
    c.gender_division,
    case c.age_group
      when 'Open' then 14.6
      when 'Masters' then 12.8
      when 'Rec' then 9.4
      when 'Junior' then 14.1
      when 'Youth A' then 12.9
      when 'Youth B' then 11.8
      when 'Youth C' then 10.7
      else 10.1
    end
      + case c.gender_division when 'Men' then 0.75 when 'Women' then 0.35 else 0.15 end
      + round((((c.climber_number::int * 29) % 17)::numeric / 17.0) * 4.4 - 2.2, 2) as base_strength,
    4 + ((c.climber_number::int * 31) % 7) as consistency_band,
    4 + ((c.climber_number::int * 37) % 8) as endurance_band,
    3 + ((c.climber_number::int * 41) % 6) as volatility_band,
    ((c.climber_number::int * 43) % 9) - 4 as upset_band
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
    profiles.base_strength,
    profiles.consistency_band,
    profiles.endurance_band,
    profiles.volatility_band,
    profiles.upset_band,
    climbs.climb_number,
    case
      when profiles.age_group = 'Rec' then least(20, 8 + profiles.endurance_band + ((profiles.athlete_number * 41) % 5))
      when profiles.age_group = 'Masters' then least(20, 9 + profiles.endurance_band + ((profiles.athlete_number * 43) % 4))
      else least(20, 7 + profiles.endurance_band + ((profiles.athlete_number * 47) % 4))
    end as max_logged_climb,
    (
      profiles.base_strength
      + (profiles.consistency_band * 0.38)
      + case
        when climbs.climb_number <= 5 then 0.9
        when climbs.climb_number <= 10 then 0.4
        else 0
      end
      - greatest(climbs.climb_number - profiles.endurance_band, 0) * 0.15
      + (((profiles.athlete_number * 53 + climbs.climb_number * 59 + profiles.volatility_band * 61) % 11) - 5) * 0.28
      + (profiles.upset_band * case when ((profiles.athlete_number + climbs.climb_number) % 6) = 0 then 0.36 else 0.1 end)
    ) as performance_score,
    case
      when profiles.competition_id = (select id from public.competitions where slug = 'spring-send-recreational')
        then 8.7
          + climbs.climb_number * 0.36
          + (((climbs.climb_number * 67 + profiles.volatility_band * 71) % 7) - 3) * 0.16
      else 10.1
        + climbs.climb_number * 0.52
        + (((climbs.climb_number * 73 + profiles.volatility_band * 79) % 9) - 4) * 0.18
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
        then performance_score >= difficulty_score - 0.2
      else performance_score >= difficulty_score - 1.25
    end as zone,
    performance_score >= difficulty_score + case
      when competition_id = (select id from public.competitions where slug = 'spring-send-recreational') then 0.1
      else 0.7
    end as topped,
    case
      when performance_score >= difficulty_score
        then greatest(1, least(5, 1 + ((athlete_number * 83 + climb_number * 89 + volatility_band * 97) % 3) + greatest(climb_number - consistency_band, 0) / 4))
      else greatest(1, least(7, 2 + ((athlete_number * 101 + climb_number * 103 + endurance_band * 107) % 4) + greatest(climb_number - endurance_band, 0) / 3))
    end as attempt_count,
    case
      when performance_score >= difficulty_score + case
        when competition_id = (select id from public.competitions where slug = 'spring-send-recreational') then 0.1
        else 0.7
      end
        then greatest(1, least(5, 1 + ((athlete_number * 149 + climb_number * 151 + volatility_band * 157) % 3) + greatest(climb_number - consistency_band, 0) / 4))
      else null
    end as raw_top_attempts,
    case
      when competition_id = (select id from public.competitions where slug = 'spring-send-recreational')
        then case when performance_score >= difficulty_score - 0.2 then greatest(1, least(5, 1 + ((athlete_number * 163 + climb_number * 167) % 3))) else null end
      when performance_score >= difficulty_score - 1.25
        then greatest(1, least(6, 1 + ((athlete_number * 173 + climb_number * 179 + endurance_band) % 4) + greatest(climb_number - endurance_band, 0) / 4))
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
      competition_id <> (select id from public.competitions where slug = 'spring-send-recreational')
      and climb_number > 11
      and ((athlete_number * 137 + climb_number * 139 + volatility_band + consistency_band) % 5) = 0
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

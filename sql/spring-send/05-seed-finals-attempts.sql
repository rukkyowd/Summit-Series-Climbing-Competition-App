with finalist_pool as (
  select
    c.id as climber_id,
    c.competition_id,
    c.climber_number::int as athlete_number,
    ef.qualifier_rank,
    greatest(1, 12 - ef.qualifier_rank) as qualifier_bonus,
    1 + ((c.climber_number::int * 149) % 7) as finals_attack,
    1 + ((c.climber_number::int * 151) % 7) as finals_precision,
    1 + ((c.climber_number::int * 157) % 6) as finals_composure
  from public.climbers c
  join public.competition_finalists ef on ef.climber_id = c.id
  where c.competition_id = (select id from public.competitions where slug = 'spring-send-youth-competitive')
),
final_attempt_seed as (
  select
    finalists.competition_id,
    finalists.climber_id,
    finalists.athlete_number,
    finalists.qualifier_rank,
    finalists.qualifier_bonus,
    finalists.finals_attack,
    finalists.finals_precision,
    finalists.finals_composure,
    climbs.climb_number,
    case climbs.climb_number
      when 1 then 11
      when 2 then 14
      when 3 then 13
      else 16
    end as problem_difficulty
  from finalist_pool finalists
  cross join (values (1), (2), (3), (4)) as climbs(climb_number)
),
final_attempt_rows as (
  select
    competition_id,
    climber_id,
    climb_number,
    (
      qualifier_bonus
      + finals_precision
      + finals_composure
      + ((athlete_number * 163 + climb_number * 167) % 9)
      >= problem_difficulty + 2
    ) as top,
    (
      qualifier_bonus
      + finals_attack
      + ((athlete_number * 173 + climb_number * 179) % 8)
      >= problem_difficulty - 2
    ) as zone,
    1 + ((athlete_number * 181 + climb_number * 191 + finals_precision * 193) % 6) as raw_top_attempts,
    1 + ((athlete_number * 197 + climb_number * 199 + finals_attack * 211) % 8) as raw_zone_attempts
  from final_attempt_seed
)
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
  rows.competition_id,
  rows.climber_id,
  rows.climb_number,
  rows.top,
  rows.top or rows.zone,
  case
    when rows.top then rows.raw_top_attempts
    else null
  end,
  case
    when rows.top or rows.zone
      then case
        when rows.top then least(rows.raw_zone_attempts, rows.raw_top_attempts)
        else rows.raw_zone_attempts
      end
    else null
  end,
  'staff'
from final_attempt_rows rows;

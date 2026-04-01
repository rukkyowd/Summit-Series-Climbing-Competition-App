begin;

-- Compatibility bootstrap for databases that have the multi-competition schema
-- but have not applied the scorecard overhaul migration yet.
do $$
begin
  if to_regclass('public.competitions') is null then
    raise exception 'Missing public.competitions. Run the base schema first.';
  end if;

  execute 'alter table public.competitions add column if not exists current_phase text';

  execute $sql$
    update public.competitions
    set current_phase = case
      when stage_mode = 'finals' then 'finals_open'
      else 'qualifier_open'
    end
    where current_phase is null
  $sql$;

  execute $sql$
    alter table public.competitions
    alter column current_phase set default 'qualifier_open'
  $sql$;

  execute $sql$
    create table if not exists public.competition_rounds (
      id uuid primary key default gen_random_uuid(),
      competition_id uuid not null references public.competitions(id) on delete cascade,
      round_number integer not null,
      name text not null,
      round_type text not null check (round_type in ('qualifier', 'semifinal', 'finals')),
      format text not null check (format in ('scramble', 'five_on_five_off', 'flash_format', 'ifsc_finals_format')),
      status text not null default 'pending' check (status in ('pending', 'active', 'scoring', 'closed', 'results')),
      problem_count integer not null default 4 check (problem_count between 1 and 8),
      counting_climbs integer,
      finals_cutoff integer check (finals_cutoff in (6, 8)),
      started_at timestamptz,
      closed_at timestamptz,
      created_at timestamptz not null default now(),
      unique (competition_id, round_number)
    )
  $sql$;

  if to_regclass('public.competition_finalists') is not null then
    execute 'alter table public.competition_finalists add column if not exists climbing_order integer';
    execute 'update public.competition_finalists set climbing_order = qualifier_rank where climbing_order is null';
  end if;
end $$;

create or replace function public.compute_qualifier_standings(p_competition_id uuid)
returns table (
  climber_id uuid,
  name text,
  climber_number text,
  province text,
  category_id text,
  display_category text,
  gender_division text,
  age_group text,
  time_slot_id uuid,
  total_score numeric,
  topped_count integer,
  zone_count integer,
  counting_attempt_total integer,
  highest_counting_climb integer,
  overall_rank integer,
  category_rank integer
)
language sql
stable
security definer
set search_path = public
as $$
  with competition_row as (
    select *
    from public.competitions
    where id = p_competition_id
  ),
  base_rows as (
    select
      c.id as climber_id,
      c.name,
      c.climber_number,
      c.province,
      c.category_id,
      c.display_category,
      c.gender_division,
      c.age_group,
      c.time_slot_id,
      gs.climb_number,
      coalesce(qa.topped, false) as topped,
      coalesce(qa.zone, qa.topped, false) as zone,
      case
        when coalesce(qa.topped, false) then greatest(coalesce(qa.attempts_to_top, qa.attempt_count, 1), 1)
        else null
      end as attempts_to_top,
      case
        when coalesce(qa.zone, qa.topped, false) then greatest(coalesce(qa.attempts_to_zone, qa.attempts_to_top, qa.attempt_count, 1), 1)
        else null
      end as attempts_to_zone,
      case
        when (select format from competition_row) in ('flash_format', 'five_on_five_off', 'ifsc_finals_format') then
          case
            when coalesce(qa.topped, false) then greatest(coalesce(qa.attempts_to_top, qa.attempt_count, 1), 1)
            when coalesce(qa.zone, qa.topped, false) then greatest(coalesce(qa.attempts_to_zone, qa.attempts_to_top, qa.attempt_count, 1), 1)
            else 0
          end
        else coalesce(qa.attempt_count, 0)
      end as scoring_attempt_count,
      case
        when (select format from competition_row) in ('flash_format', 'five_on_five_off', 'ifsc_finals_format') then
          round(greatest(
            case
              when coalesce(qa.topped, false) then greatest(0::numeric, 25 - (greatest(coalesce(qa.attempts_to_top, qa.attempt_count, 1), 1) - 1) * 0.1)
              else 0::numeric
            end,
            case
              when coalesce(qa.zone, qa.topped, false) then greatest(0::numeric, 10 - (greatest(coalesce(qa.attempts_to_zone, qa.attempts_to_top, qa.attempt_count, 1), 1) - 1) * 0.1)
              else 0::numeric
            end
          )::numeric, 1)
        when coalesce(qa.topped, false) then
          greatest(0::numeric, (gs.climb_number * 1000) - least(greatest(coalesce(qa.attempt_count, 0) - 1, 0), 3) * 200)
        else 0::numeric
      end as score
    from public.climbers c
    cross join generate_series(
      1,
      greatest(coalesce((select total_climbs from competition_row), 1), 1)
    ) as gs(climb_number)
    left join public.qualifier_attempts qa
      on qa.climber_id = c.id
     and qa.climb_number = gs.climb_number
    where c.competition_id = p_competition_id
  ),
  ranked_scores as (
    select
      base_rows.*,
      row_number() over (
        partition by climber_id
        order by score desc, climb_number desc, scoring_attempt_count asc
      ) as scoring_row,
      case
        when (select format from competition_row) in ('flash_format', 'five_on_five_off', 'ifsc_finals_format') then true
        when score > 0::numeric then true
        else false
      end as eligible_for_counting
    from base_rows
  ),
  counting_scores as (
    select *
    from ranked_scores
    where eligible_for_counting
      and scoring_row <= case
        when (select format from competition_row) in ('flash_format', 'five_on_five_off', 'ifsc_finals_format')
          then greatest(coalesce((select total_climbs from competition_row), 1), 1)
        else greatest(coalesce((select qualifier_counting_climbs from competition_row), 1), 1)
      end
  ),
  qualifier_totals as (
    select
      c.id as climber_id,
      c.name,
      c.climber_number,
      c.province,
      c.category_id,
      c.display_category,
      c.gender_division,
      c.age_group,
      c.time_slot_id,
      coalesce(sum(cs.score), 0::numeric) as total_score,
      coalesce(count(*) filter (where cs.topped), 0)::integer as topped_count,
      coalesce(count(*) filter (where cs.zone), 0)::integer as zone_count,
      coalesce(sum(
        case
          when cs.topped then coalesce(cs.attempts_to_top, cs.scoring_attempt_count, 0)
          when cs.zone then coalesce(cs.attempts_to_zone, cs.scoring_attempt_count, 0)
          else coalesce(cs.scoring_attempt_count, 0)
        end
      ), 0)::integer as counting_attempt_total,
      coalesce((array_agg(cs.climb_number order by cs.score desc, cs.climb_number desc, cs.scoring_attempt_count asc))[1], 0)::integer as highest_counting_climb
    from public.climbers c
    left join counting_scores cs on cs.climber_id = c.id
    where c.competition_id = p_competition_id
    group by c.id, c.name, c.climber_number, c.province, c.category_id, c.display_category, c.gender_division, c.age_group, c.time_slot_id
  ),
  ranked as (
    select
      qualifier_totals.*,
      rank() over (
        order by total_score desc, topped_count desc, zone_count desc, counting_attempt_total asc, highest_counting_climb desc
      )::integer as overall_rank,
      rank() over (
        partition by category_id
        order by total_score desc, topped_count desc, zone_count desc, counting_attempt_total asc, highest_counting_climb desc
      )::integer as category_rank
    from qualifier_totals
  )
  select *
  from ranked
  order by total_score desc, topped_count desc, zone_count desc, counting_attempt_total asc, highest_counting_climb desc, name asc;
$$;

create or replace function public.compute_finalist_selection(p_competition_id uuid)
returns table (
  climber_id uuid,
  name text,
  category_id text,
  display_category text,
  gender_division text,
  age_group text,
  qualifier_rank integer,
  advanced_with_tie boolean,
  climbing_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  with competition_row as (
    select *
    from public.competitions
    where id = p_competition_id
  ),
  ranked as (
    select *
    from public.compute_qualifier_standings(p_competition_id)
    where gender_division in ('Men', 'Women')
      and age_group in (
        select jsonb_array_elements_text((select finals_eligible_age_groups from competition_row))
      )
  ),
  cutoff as (
    select
      category_id,
      total_score,
      topped_count,
      zone_count,
      counting_attempt_total,
      highest_counting_climb
    from ranked
    where category_rank = (select finals_cutoff from competition_row)
  ),
  selected as (
    select
      ranked.climber_id,
      ranked.name,
      ranked.category_id,
      ranked.display_category,
      ranked.gender_division,
      ranked.age_group,
      ranked.category_rank as qualifier_rank,
      ranked.category_rank > (select finals_cutoff from competition_row) as advanced_with_tie
    from ranked
    left join cutoff using (category_id)
    where ranked.category_rank <= (select finals_cutoff from competition_row)
       or (
         (select finals_tie_advances from competition_row)
         and cutoff.category_id is not null
         and ranked.category_rank > (select finals_cutoff from competition_row)
         and ranked.total_score = cutoff.total_score
         and ranked.topped_count = cutoff.topped_count
         and ranked.zone_count = cutoff.zone_count
         and ranked.counting_attempt_total = cutoff.counting_attempt_total
         and ranked.highest_counting_climb = cutoff.highest_counting_climb
       )
  )
  select
    selected.*,
    row_number() over (
      partition by selected.display_category
      order by selected.qualifier_rank desc, selected.name asc
    )::integer as climbing_order
  from selected
  order by selected.display_category, selected.qualifier_rank, selected.name;
$$;

-- Remove prior mock competitions only. Child rows cascade.
delete from public.competitions
where slug like 'mock-%';

-- 1. Create a varied mock event slate:
--    - active scramble qualifier
--    - active youth qualifier with official start groups
--    - future flash qualifier
--    - active national finals
--    - completed city finals/results
--    - future scramble
insert into public.competitions (
  id,
  slug,
  name,
  status,
  format,
  current_phase,
  discipline_label,
  stage_mode,
  location_name,
  start_date,
  end_date,
  registration_opens_at,
  registration_closes_at,
  description,
  hero_image_url,
  total_climbs,
  max_climbers,
  qualifier_counting_climbs,
  finals_cutoff,
  finals_tie_advances,
  qualifier_eligible_age_groups,
  finals_eligible_age_groups,
  qualifier_locked_at,
  finals_started_at,
  finals_problem_count
)
values
  (
    gen_random_uuid(),
    'mock-rec-scramble-live',
    'Capital Granite Scramble',
    'active',
    'scramble',
    'qualifier_open',
    'Boulder',
    'qualifier',
    'Fredericton',
    current_date,
    current_date,
    now() - interval '5 days',
    now() + interval '8 hours',
    'Community bouldering day with rolling scramble sessions, self-scoring, and an evening podium.',
    '',
    30,
    120,
    6,
    6,
    true,
    '["Rec","Open","Masters"]'::jsonb,
    '["Open"]'::jsonb,
    null,
    null,
    4
  ),
  (
    gen_random_uuid(),
    'mock-youth-series-live',
    'Atlantic Youth Boulder Series',
    'active',
    'five_on_five_off',
    'qualifier_open',
    'Boulder',
    'qualifier',
    'Halifax',
    current_date,
    current_date,
    now() - interval '14 days',
    now() + interval '3 hours',
    'Regional youth qualifier with fixed start waves, judge-entered scoring, and a same-day finals round.',
    '',
    12,
    96,
    12,
    6,
    true,
    '["Youth D","Youth C","Youth B","Youth A","Junior"]'::jsonb,
    '["Youth B","Youth A","Junior"]'::jsonb,
    null,
    null,
    4
  ),
  (
    gen_random_uuid(),
    'mock-flash-upcoming',
    'Fundy Flash Classic',
    'active',
    'flash_format',
    'qualifier_closed',
    'Boulder',
    'qualifier',
    'Moncton',
    current_date + 14,
    current_date + 14,
    now() + interval '2 days',
    now() + interval '13 days',
    'Sanctioned-style flash qualifier built around short rotations and an afternoon awards block.',
    '',
    6,
    80,
    6,
    8,
    true,
    '["Youth B","Youth A","Junior","Open"]'::jsonb,
    '["Junior","Open"]'::jsonb,
    null,
    null,
    4
  ),
  (
    gen_random_uuid(),
    'mock-national-finals-live',
    'Canadian Boulder Championships',
    'active',
    'flash_format',
    'finals_open',
    'Boulder',
    'finals',
    'Toronto',
    current_date,
    current_date,
    now() - interval '30 days',
    now() - interval '8 hours',
    'Championship field with qualifier rankings locked and the finals round already underway.',
    '',
    6,
    100,
    6,
    8,
    true,
    '["Junior","Open"]'::jsonb,
    '["Junior","Open"]'::jsonb,
    now() - interval '4 hours',
    now() - interval '40 minutes',
    4
  ),
  (
    gen_random_uuid(),
    'mock-city-boulder-results',
    'Port City Boulder Open',
    'active',
    'ifsc_finals_format',
    'results',
    'Boulder',
    'finals',
    'Saint John',
    current_date - 7,
    current_date - 7,
    now() - interval '40 days',
    now() - interval '8 days',
    'One-day city bouldering event with completed finals and published results.',
    '',
    10,
    90,
    10,
    6,
    true,
    '["Open"]'::jsonb,
    '["Open"]'::jsonb,
    now() - interval '7 days 5 hours',
    now() - interval '7 days 2 hours',
    4
  ),
  (
    gen_random_uuid(),
    'mock-scramble-upcoming',
    'Red Sand Scramble',
    'active',
    'scramble',
    'qualifier_closed',
    'Boulder',
    'qualifier',
    'Charlottetown',
    current_date + 30,
    current_date + 30,
    now() + interval '10 days',
    now() + interval '29 days',
    'Summer community scramble with flexible arrival windows, self-scoring, and a casual awards wrap-up.',
    '',
    35,
    140,
    7,
    6,
    true,
    '["Rec","Open","Masters"]'::jsonb,
    '["Open"]'::jsonb,
    null,
    null,
    4
  );

-- 2. Categories, tailored per competition instead of inserting every possible age group.
with category_matrix(slug, gender_division, age_group) as (
  values
    ('mock-rec-scramble-live', 'Men', 'Rec'),
    ('mock-rec-scramble-live', 'Women', 'Rec'),
    ('mock-rec-scramble-live', 'X', 'Rec'),
    ('mock-rec-scramble-live', 'Men', 'Open'),
    ('mock-rec-scramble-live', 'Women', 'Open'),
    ('mock-rec-scramble-live', 'X', 'Open'),
    ('mock-rec-scramble-live', 'Men', 'Masters'),
    ('mock-rec-scramble-live', 'Women', 'Masters'),
    ('mock-rec-scramble-live', 'X', 'Masters'),

    ('mock-youth-series-live', 'Men', 'Youth D'),
    ('mock-youth-series-live', 'Women', 'Youth D'),
    ('mock-youth-series-live', 'Men', 'Youth C'),
    ('mock-youth-series-live', 'Women', 'Youth C'),
    ('mock-youth-series-live', 'Men', 'Youth B'),
    ('mock-youth-series-live', 'Women', 'Youth B'),
    ('mock-youth-series-live', 'Men', 'Youth A'),
    ('mock-youth-series-live', 'Women', 'Youth A'),
    ('mock-youth-series-live', 'Men', 'Junior'),
    ('mock-youth-series-live', 'Women', 'Junior'),

    ('mock-flash-upcoming', 'Men', 'Youth B'),
    ('mock-flash-upcoming', 'Women', 'Youth B'),
    ('mock-flash-upcoming', 'Men', 'Youth A'),
    ('mock-flash-upcoming', 'Women', 'Youth A'),
    ('mock-flash-upcoming', 'Men', 'Junior'),
    ('mock-flash-upcoming', 'Women', 'Junior'),
    ('mock-flash-upcoming', 'Men', 'Open'),
    ('mock-flash-upcoming', 'Women', 'Open'),

    ('mock-national-finals-live', 'Men', 'Junior'),
    ('mock-national-finals-live', 'Women', 'Junior'),
    ('mock-national-finals-live', 'Men', 'Open'),
    ('mock-national-finals-live', 'Women', 'Open'),

    ('mock-city-boulder-results', 'Men', 'Open'),
    ('mock-city-boulder-results', 'Women', 'Open'),

    ('mock-scramble-upcoming', 'Men', 'Rec'),
    ('mock-scramble-upcoming', 'Women', 'Rec'),
    ('mock-scramble-upcoming', 'X', 'Rec'),
    ('mock-scramble-upcoming', 'Men', 'Open'),
    ('mock-scramble-upcoming', 'Women', 'Open'),
    ('mock-scramble-upcoming', 'X', 'Open'),
    ('mock-scramble-upcoming', 'Men', 'Masters'),
    ('mock-scramble-upcoming', 'Women', 'Masters')
),
resolved_categories as (
  select
    c.id as competition_id,
    cm.gender_division,
    cm.age_group,
    cm.gender_division || ' / ' || cm.age_group as display_name,
    row_number() over (
      partition by c.id
      order by
        case cm.gender_division when 'Men' then 1 when 'Women' then 2 else 3 end,
        case cm.age_group
          when 'Youth D' then 1
          when 'Youth C' then 2
          when 'Youth B' then 3
          when 'Youth A' then 4
          when 'Junior' then 5
          when 'Rec' then 6
          when 'Masters' then 7
          else 8
        end
    ) - 1 as sort_order
  from category_matrix cm
  join public.competitions c
    on c.slug = cm.slug
)
insert into public.competition_categories (
  id,
  competition_id,
  gender_division,
  age_group,
  display_name,
  sort_order
)
select
  gender_division || '::' || age_group,
  competition_id,
  gender_division,
  age_group,
  display_name,
  sort_order
from resolved_categories;

-- 3. Schedule blocks / time slots / start groups.
with schedule_seed(
  slug,
  label,
  phase_type,
  audience_label,
  is_active,
  start_time,
  end_time,
  capacity,
  eligible_age_groups
) as (
  values
    ('mock-rec-scramble-live', 'Check-in', 'check_in', 'All climbers', false, '8:00 AM', '8:45 AM', 120, null::text[]),
    ('mock-rec-scramble-live', 'Rec / Masters Session', 'qualifier_round', 'Morning scramble window', true, '9:00 AM', '11:00 AM', 60, array['Rec','Masters']::text[]),
    ('mock-rec-scramble-live', 'Open Session', 'qualifier_round', 'Midday scramble window', false, '11:30 AM', '1:30 PM', 60, array['Open']::text[]),
    ('mock-rec-scramble-live', 'Results / Awards', 'results', 'All climbers', false, '3:00 PM', '3:30 PM', 120, null::text[]),

    ('mock-youth-series-live', 'Check-in', 'check_in', 'All athletes', false, '7:30 AM', '8:15 AM', 96, null::text[]),
    ('mock-youth-series-live', 'Technical meeting', 'technical_meeting', 'Athletes and coaches', false, '8:20 AM', '8:35 AM', 96, null::text[]),
    ('mock-youth-series-live', 'Youth D / Youth C Wave', 'qualifier_round', 'Qualifier wave', false, '9:00 AM', '10:20 AM', 32, array['Youth D','Youth C']::text[]),
    ('mock-youth-series-live', 'Youth B / Youth A Wave', 'qualifier_round', 'Qualifier wave', true, '10:35 AM', '11:55 AM', 32, array['Youth B','Youth A']::text[]),
    ('mock-youth-series-live', 'Junior Wave', 'qualifier_round', 'Qualifier wave', false, '12:10 PM', '1:10 PM', 32, array['Junior']::text[]),
    ('mock-youth-series-live', 'Observation', 'observation', 'Finalists', false, '3:45 PM', '4:00 PM', 24, null::text[]),
    ('mock-youth-series-live', 'Finals', 'finals_round', 'Finalists', false, '4:15 PM', '5:30 PM', 24, null::text[]),

    ('mock-flash-upcoming', 'Check-in', 'check_in', 'All athletes', false, '8:00 AM', '8:45 AM', 80, null::text[]),
    ('mock-flash-upcoming', 'Technical meeting', 'technical_meeting', 'Athletes and coaches', false, '8:50 AM', '9:05 AM', 80, null::text[]),
    ('mock-flash-upcoming', 'Youth B / Youth A Rotation', 'qualifier_round', 'Flash rotation', false, '9:15 AM', '10:15 AM', 40, array['Youth B','Youth A']::text[]),
    ('mock-flash-upcoming', 'Junior / Open Rotation', 'qualifier_round', 'Flash rotation', false, '10:30 AM', '11:30 AM', 40, array['Junior','Open']::text[]),
    ('mock-flash-upcoming', 'Results', 'results', 'All athletes', false, '4:00 PM', '4:30 PM', 80, null::text[]),

    ('mock-national-finals-live', 'Isolation', 'isolation', 'Finalists', false, '4:45 PM', '5:15 PM', 24, null::text[]),
    ('mock-national-finals-live', 'Observation', 'observation', 'Finalists', false, '5:20 PM', '5:35 PM', 24, null::text[]),
    ('mock-national-finals-live', 'Finals', 'finals_round', 'Finalists', true, '5:45 PM', '7:00 PM', 24, null::text[]),
    ('mock-national-finals-live', 'Results', 'results', 'All athletes', false, '7:20 PM', '7:45 PM', 120, null::text[]),

    ('mock-city-boulder-results', 'Observation', 'observation', 'Finalists', false, '4:50 PM', '5:05 PM', 20, null::text[]),
    ('mock-city-boulder-results', 'Finals', 'finals_round', 'Finalists', false, '5:15 PM', '6:30 PM', 20, null::text[]),
    ('mock-city-boulder-results', 'Results posted', 'results', 'All athletes', true, '6:45 PM', '7:15 PM', 90, null::text[]),

    ('mock-scramble-upcoming', 'Check-in', 'check_in', 'All climbers', false, '9:00 AM', '9:30 AM', 140, null::text[]),
    ('mock-scramble-upcoming', 'Rec / Masters Session', 'qualifier_round', 'Early scramble window', false, '10:00 AM', '12:00 PM', 70, array['Rec','Masters']::text[]),
    ('mock-scramble-upcoming', 'Open Session', 'qualifier_round', 'Late scramble window', false, '12:30 PM', '2:30 PM', 70, array['Open']::text[]),
    ('mock-scramble-upcoming', 'Awards', 'results', 'All climbers', false, '4:00 PM', '4:30 PM', 140, null::text[])
),
resolved_blocks as (
  select
    gen_random_uuid() as id,
    c.id as competition_id,
    ss.label,
    ss.phase_type,
    ss.audience_label,
    ss.is_active,
    ss.start_time,
    ss.end_time,
    ss.capacity,
    coalesce(
      (
        select jsonb_agg(cat.id order by cat.sort_order)
        from public.competition_categories cat
        where cat.competition_id = c.id
          and (
            ss.eligible_age_groups is null
            or cat.age_group = any(ss.eligible_age_groups)
          )
      ),
      '[]'::jsonb
    ) as eligible_category_ids
  from schedule_seed ss
  join public.competitions c
    on c.slug = ss.slug
)
insert into public.competition_schedule_blocks (
  id,
  competition_id,
  label,
  phase_type,
  audience_label,
  is_active,
  start_time,
  end_time,
  capacity,
  eligible_category_ids
)
select
  id,
  competition_id,
  label,
  phase_type,
  audience_label,
  is_active,
  start_time,
  end_time,
  capacity,
  eligible_category_ids
from resolved_blocks;

-- 4. Rounds for each event.
insert into public.competition_rounds (
  competition_id,
  round_number,
  name,
  round_type,
  format,
  status,
  problem_count,
  counting_climbs,
  finals_cutoff,
  started_at,
  closed_at
)
select
  c.id,
  1,
  'Qualifier',
  'qualifier',
  c.format,
  case
    when c.current_phase = 'qualifier_open' then 'active'
    when c.current_phase in ('qualifier_closed', 'wall_reset', 'observation', 'finals_open', 'finals_closed', 'results') then 'closed'
    else 'pending'
  end,
  c.total_climbs,
  c.qualifier_counting_climbs,
  c.finals_cutoff,
  case when c.current_phase in ('qualifier_open', 'finals_open', 'results') then now() - interval '6 hours' end,
  case when c.current_phase in ('finals_open', 'results') then coalesce(c.qualifier_locked_at, now() - interval '4 hours') end
from public.competitions c
where c.slug like 'mock-%'
union all
select
  c.id,
  2,
  'Finals',
  'finals',
  'ifsc_finals_format',
  case
    when c.current_phase = 'finals_open' then 'active'
    when c.current_phase = 'results' then 'results'
    else 'pending'
  end,
  c.finals_problem_count,
  null,
  c.finals_cutoff,
  c.finals_started_at,
  case when c.current_phase = 'results' then now() - interval '7 days 1 hour' end
from public.competitions c
where c.slug like 'mock-%';

-- 5. Large athlete pool across events.
with category_targets as (
  select
    comp.slug,
    comp.id as competition_id,
    cat.id as category_id,
    cat.gender_division,
    cat.age_group,
    cat.display_name,
    case
      when comp.slug = 'mock-rec-scramble-live' and cat.age_group = 'Rec' then 12
      when comp.slug = 'mock-rec-scramble-live' and cat.age_group = 'Open' then 10
      when comp.slug = 'mock-rec-scramble-live' and cat.age_group = 'Masters' then 8

      when comp.slug = 'mock-youth-series-live' and cat.age_group in ('Youth D', 'Youth C') then 8
      when comp.slug = 'mock-youth-series-live' and cat.age_group in ('Youth B', 'Youth A') then 10
      when comp.slug = 'mock-youth-series-live' and cat.age_group = 'Junior' then 8

      when comp.slug = 'mock-flash-upcoming' and cat.age_group in ('Youth B', 'Youth A') then 6
      when comp.slug = 'mock-flash-upcoming' and cat.age_group in ('Junior', 'Open') then 8

      when comp.slug = 'mock-national-finals-live' and cat.age_group = 'Junior' then 10
      when comp.slug = 'mock-national-finals-live' and cat.age_group = 'Open' then 14

      when comp.slug = 'mock-city-boulder-results' and cat.age_group = 'Open' then 16

      when comp.slug = 'mock-scramble-upcoming' and cat.age_group = 'Rec' then 12
      when comp.slug = 'mock-scramble-upcoming' and cat.age_group = 'Open' then 10
      when comp.slug = 'mock-scramble-upcoming' and cat.age_group = 'Masters' then 8
      else 0
    end as athlete_count
  from public.competitions comp
  join public.competition_categories cat
    on cat.competition_id = comp.id
  where comp.slug like 'mock-%'
),
athlete_rows as (
  select
    ct.*,
    gs.n as athlete_index
  from category_targets ct
  cross join lateral generate_series(1, ct.athlete_count) as gs(n)
  where ct.athlete_count > 0
),
numbered_athletes as (
  select
    ar.*,
    row_number() over (
      partition by ar.competition_id
      order by ar.display_name, ar.athlete_index
    ) as comp_sequence,
    row_number() over (
      order by ar.slug, ar.display_name, ar.athlete_index
    ) as global_sequence
  from athlete_rows ar
),
resolved_athletes as (
  select
    gen_random_uuid() as id,
    na.competition_id,
    (
      array[
        'Avery','Jordan','Parker','Mason','Logan','Taylor','Alex','Riley','Rowan','Cameron',
        'Finley','Reese','Quinn','Emerson','Casey','Sydney','Morgan','Jamie','Harper','Sawyer',
        'Dakota','Charlie','Elliot','Hayden','Blair','Skyler','Ainsley','Noah','Luca','Tatum',
        'Nico','Kai','Brooke','Remy','Sage','Peyton','Ari','Devon','Jules','Maren'
      ]
    )[1 + ((na.global_sequence - 1) % 40)]
    || ' ' ||
    (
      array[
        'Chen','Smith','Patel','Johnson','Martin','Lee','Nguyen','Brown','Garcia','Taylor',
        'Wilson','Anderson','Clark','Young','Hall','Allen','Wright','King','Scott','Green',
        'Baker','Adams','Hill','Campbell','Mitchell','Parker','Turner','Robinson','Carter','Murphy',
        'Lopez','Cooper','Morgan','Gray','Ward','Bailey','Cox','Diaz','Long','Brooks'
      ]
    )[1 + (((na.global_sequence - 1) * 7) % 40)] as name,
    lpad(na.comp_sequence::text, 3, '0') as climber_number,
    (
      array[
        'NB','NS','PE','NL','QC','ON','MB','SK','AB','BC','YT','NT'
      ]
    )[1 + (((na.global_sequence - 1) * 5) % 12)] as province,
    na.category_id,
    na.gender_division,
    na.age_group,
    na.display_name as display_category,
    case
      when na.slug = 'mock-rec-scramble-live' and na.age_group in ('Rec', 'Masters') then
        (
          select csb.id
          from public.competition_schedule_blocks csb
          where csb.competition_id = na.competition_id
            and csb.label = 'Rec / Masters Session'
          limit 1
        )
      when na.slug = 'mock-rec-scramble-live' and na.age_group = 'Open' then
        (
          select csb.id
          from public.competition_schedule_blocks csb
          where csb.competition_id = na.competition_id
            and csb.label = 'Open Session'
          limit 1
        )
      when na.slug = 'mock-youth-series-live' and na.age_group in ('Youth D', 'Youth C') then
        (
          select csb.id
          from public.competition_schedule_blocks csb
          where csb.competition_id = na.competition_id
            and csb.label = 'Youth D / Youth C Wave'
          limit 1
        )
      when na.slug = 'mock-youth-series-live' and na.age_group in ('Youth B', 'Youth A') then
        (
          select csb.id
          from public.competition_schedule_blocks csb
          where csb.competition_id = na.competition_id
            and csb.label = 'Youth B / Youth A Wave'
          limit 1
        )
      when na.slug = 'mock-youth-series-live' and na.age_group = 'Junior' then
        (
          select csb.id
          from public.competition_schedule_blocks csb
          where csb.competition_id = na.competition_id
            and csb.label = 'Junior Wave'
          limit 1
        )
      when na.slug = 'mock-flash-upcoming' and na.age_group in ('Youth B', 'Youth A') then
        (
          select csb.id
          from public.competition_schedule_blocks csb
          where csb.competition_id = na.competition_id
            and csb.label = 'Youth B / Youth A Rotation'
          limit 1
        )
      when na.slug = 'mock-flash-upcoming' and na.age_group in ('Junior', 'Open') then
        (
          select csb.id
          from public.competition_schedule_blocks csb
          where csb.competition_id = na.competition_id
            and csb.label = 'Junior / Open Rotation'
          limit 1
        )
      when na.slug = 'mock-scramble-upcoming' and na.age_group in ('Rec', 'Masters') then
        (
          select csb.id
          from public.competition_schedule_blocks csb
          where csb.competition_id = na.competition_id
            and csb.label = 'Rec / Masters Session'
          limit 1
        )
      when na.slug = 'mock-scramble-upcoming' and na.age_group = 'Open' then
        (
          select csb.id
          from public.competition_schedule_blocks csb
          where csb.competition_id = na.competition_id
            and csb.label = 'Open Session'
          limit 1
        )
      else null
    end as time_slot_id,
    md5(na.competition_id::text || ':' || na.category_id || ':' || na.athlete_index || ':mock') as access_token,
    now() - (((na.comp_sequence % 18) + 1) || ' hours')::interval as registered_at
  from numbered_athletes na
)
insert into public.climbers (
  id,
  competition_id,
  name,
  climber_number,
  province,
  category_id,
  gender_division,
  age_group,
  display_category,
  time_slot_id,
  access_token,
  access_token_created_at,
  registered_at
)
select
  id,
  competition_id,
  name,
  climber_number,
  province,
  category_id,
  gender_division,
  age_group,
  display_category,
  time_slot_id,
  access_token,
  registered_at,
  registered_at
from resolved_athletes;

-- 6. Seed qualifier attempts for live/finals/results competitions.
with scored_events as (
  select id, slug, format, total_climbs
  from public.competitions
  where slug in (
    'mock-rec-scramble-live',
    'mock-youth-series-live',
    'mock-national-finals-live',
    'mock-city-boulder-results'
  )
),
attempt_source as (
  select
    c.competition_id,
    c.id as climber_id,
    se.slug,
    se.format,
    gs.climb_number,
    get_byte(decode(md5(c.id::text || ':' || gs.climb_number::text || ':a'), 'hex'), 0) as seed_a,
    get_byte(decode(md5(c.id::text || ':' || gs.climb_number::text || ':b'), 'hex'), 0) as seed_b,
    get_byte(decode(md5(c.id::text || ':' || gs.climb_number::text || ':c'), 'hex'), 0) as seed_c,
    get_byte(decode(md5(c.id::text || ':' || gs.climb_number::text || ':d'), 'hex'), 0) as seed_d
  from public.climbers c
  join scored_events se
    on se.id = c.competition_id
  cross join lateral generate_series(1, se.total_climbs) as gs(climb_number)
),
attempt_outcomes as (
  select
    competition_id,
    climber_id,
    climb_number,
    slug,
    format,
    case
      when format = 'scramble' then seed_a < 72
      else seed_a < 82
    end as attempted,
    case
      when format = 'scramble' then seed_b < 24
      else seed_b < 18
    end as topped_raw,
    case
      when format = 'scramble' then false
      else seed_c < 48
    end as zone_raw,
    1 + (seed_b % 4) as top_tries,
    1 + (seed_c % 5) as zone_tries,
    1 + (seed_d % 6) as generic_tries
  from attempt_source
),
materialized_attempts as (
  select
    competition_id,
    climber_id,
    climb_number,
    case when format = 'scramble' then topped_raw else (topped_raw or zone_raw) end as zone,
    topped_raw as topped,
    case
      when topped_raw then top_tries
      when format <> 'scramble' and zone_raw then zone_tries
      else generic_tries
    end as attempt_count,
    case when topped_raw then top_tries end as attempts_to_top,
    case
      when topped_raw then top_tries
      when format <> 'scramble' and zone_raw then zone_tries
      else null
    end as attempts_to_zone,
    case when format = 'scramble' then 'climber' else 'staff' end as entered_by
  from attempt_outcomes
  where attempted
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
  competition_id,
  climber_id,
  climb_number,
  attempt_count,
  zone,
  topped,
  attempts_to_top,
  attempts_to_zone,
  entered_by
from materialized_attempts;

-- 7. Persist finalists for finals-live and results events using the official scoring function.
with finals_competitions as (
  select id
  from public.competitions
  where slug in ('mock-national-finals-live', 'mock-city-boulder-results')
)
insert into public.competition_finalists (
  competition_id,
  climber_id,
  name,
  category_id,
  display_category,
  gender_division,
  age_group,
  qualifier_rank,
  advanced_with_tie,
  climbing_order
)
select distinct on (fc.id, fs.climber_id)
  fc.id,
  fs.climber_id,
  fs.name,
  fs.category_id,
  fs.display_category,
  fs.gender_division,
  fs.age_group,
  fs.qualifier_rank,
  fs.advanced_with_tie,
  fs.climbing_order
from finals_competitions fc
cross join lateral public.compute_finalist_selection(fc.id) fs;

-- 8. Seed finals attempts:
--    - live finals event has partial scores
--    - results event has complete scores
with finals_events as (
  select
    c.id as competition_id,
    c.slug,
    c.current_phase,
    c.finals_problem_count
  from public.competitions c
  where c.slug in ('mock-national-finals-live', 'mock-city-boulder-results')
),
final_attempt_source as (
  select
    fe.competition_id,
    fe.slug,
    fe.current_phase,
    cf.climber_id,
    gs.climb_number,
    get_byte(decode(md5(cf.climber_id::text || ':' || gs.climb_number::text || ':fa'), 'hex'), 0) as seed_a,
    get_byte(decode(md5(cf.climber_id::text || ':' || gs.climb_number::text || ':fb'), 'hex'), 0) as seed_b,
    get_byte(decode(md5(cf.climber_id::text || ':' || gs.climb_number::text || ':fc'), 'hex'), 0) as seed_c
  from finals_events fe
  join public.competition_finalists cf
    on cf.competition_id = fe.competition_id
  cross join lateral generate_series(1, fe.finals_problem_count) as gs(climb_number)
),
final_attempts_seed as (
  select
    competition_id,
    climber_id,
    climb_number,
    case
      when current_phase = 'finals_open' then climb_number <= 2
      else true
    end as should_insert,
    seed_a < 22 as top_raw,
    seed_b < 54 as zone_raw,
    1 + (seed_b % 4) as top_tries,
    1 + (seed_c % 5) as zone_tries
  from final_attempt_source
),
materialized_final_attempts as (
  select
    competition_id,
    climber_id,
    climb_number,
    top_raw as top,
    (top_raw or zone_raw) as zone,
    case when top_raw then top_tries end as attempts_to_top,
    case when top_raw then top_tries when zone_raw then zone_tries end as attempts_to_zone
  from final_attempts_seed
  where should_insert
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
  competition_id,
  climber_id,
  climb_number,
  top,
  zone,
  attempts_to_top,
  attempts_to_zone,
  'staff'
from materialized_final_attempts;

commit;

begin;

-- Compatibility bootstrap for databases that have the multi-competition schema
-- but have not applied the scorecard overhaul migration yet.
do $$
begin
  if to_regclass('public.competitions') is null then
    raise exception 'Missing public.competitions. Run the base schema first.';
  end if;

  execute 'alter table public.competitions add column if not exists current_phase text';
  execute 'alter table public.competitions add column if not exists has_finals boolean not null default true';
  execute 'alter table public.competitions add column if not exists qualifier_eligible_age_groups jsonb not null default ''["Youth D","Youth C","Youth B","Youth A","Junior","Rec","Masters","Open"]''::jsonb';
  execute 'alter table public.competitions add column if not exists finals_eligible_age_groups jsonb not null default ''["Open"]''::jsonb';
  execute 'alter table public.competitions add column if not exists qualifier_locked_at timestamptz';
  execute 'alter table public.competitions add column if not exists finals_started_at timestamptz';
  execute 'alter table public.competitions add column if not exists finals_problem_count integer not null default 4';

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
    alter table public.competitions
    drop constraint if exists competitions_finals_problem_count_check
  $sql$;

  execute $sql$
    alter table public.competitions
    add constraint competitions_finals_problem_count_check
    check (finals_problem_count between 1 and 8)
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

  execute $sql$
    create table if not exists public.competition_boulder_queue (
      id uuid primary key default gen_random_uuid(),
      competition_id uuid not null references public.competitions(id) on delete cascade,
      climber_id uuid not null references public.climbers(id) on delete cascade,
      schedule_block_id uuid not null references public.competition_schedule_blocks(id) on delete cascade,
      climb_number integer not null check (climb_number >= 1),
      checked_in_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      unique (competition_id, climber_id)
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
where slug like 'mock-%'
   or slug in ('spring-send-recreational', 'spring-send-youth');

-- 1. Create a varied mock event slate:
--    - Spring Send recreational scramble
--    - Spring Send youth competitive day
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
  has_finals,
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
    'spring-send-recreational',
    'Spring Send Recreational Scramble',
    'active',
    'scramble',
    'qualifier_open',
    'Boulder',
    'qualifier',
    'Halifax',
    current_date,
    current_date,
    now() - interval '14 days',
    now() + interval '5 hours',
    'Spring Send 2026 recreational day built as a clean qualifier-only scramble: morning check-in, route briefing, two self-scored session windows, score verification, and a casual community awards wrap-up.',
    '',
    24,
    96,
    6,
    false,
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
    'spring-send-youth',
    'Spring Send Youth Competitive',
    'active',
    'five_on_five_off',
    'qualifier_open',
    'Boulder',
    'qualifier',
    'Halifax',
    current_date + 7,
    current_date + 7,
    now() - interval '7 days',
    now() + interval '6 days',
    'Spring Send 2026 youth championship day with athlete check-in, judges briefing, technical meeting, staggered qualifier waves, finals isolation, observation, and a podium close.',
    '',
    16,
    120,
    8,
    true,
    8,
    true,
    '["Youth D","Youth C","Youth B","Youth A","Junior"]'::jsonb,
    '["Youth B","Youth A","Junior"]'::jsonb,
    null,
    null,
    4
  ),
  (
    gen_random_uuid(),
    'mock-rec-scramble-live',
    'Bridgeport Community Boulder Scramble',
    'active',
    'scramble',
    'qualifier_open',
    'Boulder',
    'qualifier',
    'Bridgeport',
    current_date,
    current_date,
    now() - interval '18 days',
    now() + interval '2 hours',
    'Community scramble stop refreshed for the 2026 North American season: check-in, officials briefing, athlete technical meeting, two scramble windows, score review, and an afternoon awards block.',
    '',
    30,
    120,
    6,
    false,
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
    'Kaunas Youth Boulder Showcase',
    'active',
    'five_on_five_off',
    'qualifier_open',
    'Boulder',
    'qualifier',
    'Kaunas',
    current_date,
    current_date,
    now() - interval '32 days',
    now() + interval '90 minutes',
    'Youth boulder day inspired by the 2026 European youth calendar: check-in, judges briefing, athlete technical meeting, staggered qualifier waves, isolation, observation, four-boulder finals, and awards.',
    '',
    16,
    96,
    8,
    true,
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
    'Quebec City Junior Boulder Championship',
    'active',
    'flash_format',
    'qualifier_closed',
    'Boulder',
    'qualifier',
    'Quebec City',
    current_date + 14,
    current_date + 15,
    now() + interval '2 days',
    now() + interval '12 days',
    'Two-day junior championship refreshed around the 2026 North American boulder calendar: hall opening, warm-up wall, registration desk, technical meeting, day-one qualifiers, day-two isolation and finals, and a medal ceremony.',
    '',
    6,
    80,
    6,
    true,
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
    'Salt Lake City Elite Boulder Finals',
    'active',
    'flash_format',
    'finals_open',
    'Boulder',
    'finals',
    'Salt Lake City',
    current_date,
    current_date,
    now() - interval '30 days',
    now() - interval '8 hours',
    'Elite finals session aligned with the 2026 Salt Lake City bouldering stop: rankings locked, finalists isolated, presentation complete, and the live round underway under judge control.',
    '',
    6,
    100,
    6,
    true,
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
    'Alcobendas City Boulder Open',
    'active',
    'ifsc_finals_format',
    'results',
    'Boulder',
    'finals',
    'Alcobendas',
    current_date - 7,
    current_date - 7,
    now() - interval '40 days',
    now() - interval '8 days',
    'One-day city open modeled after the 2026 Madrid-area bouldering calendar, with a complete finals cycle already finished, public results posted, and a polished award-ceremony closeout.',
    '',
    10,
    90,
    10,
    true,
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
    'Vail Community Boulder Scramble',
    'active',
    'scramble',
    'qualifier_closed',
    'Boulder',
    'qualifier',
    'Vail',
    current_date + 30,
    current_date + 30,
    now() + interval '7 days',
    now() + interval '28 days',
    'Mountain-town recreational scramble refreshed for the 2026 North American season, with a registration desk, technical meeting, category-based session windows, score verification, and a low-key podium wrap-up.',
    '',
    35,
    140,
    7,
    false,
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
    ('spring-send-recreational', 'Men', 'Rec'),
    ('spring-send-recreational', 'Women', 'Rec'),
    ('spring-send-recreational', 'X', 'Rec'),
    ('spring-send-recreational', 'Men', 'Open'),
    ('spring-send-recreational', 'Women', 'Open'),
    ('spring-send-recreational', 'X', 'Open'),
    ('spring-send-recreational', 'Men', 'Masters'),
    ('spring-send-recreational', 'Women', 'Masters'),
    ('spring-send-recreational', 'X', 'Masters'),

    ('spring-send-youth', 'Men', 'Youth D'),
    ('spring-send-youth', 'Women', 'Youth D'),
    ('spring-send-youth', 'Men', 'Youth C'),
    ('spring-send-youth', 'Women', 'Youth C'),
    ('spring-send-youth', 'Men', 'Youth B'),
    ('spring-send-youth', 'Women', 'Youth B'),
    ('spring-send-youth', 'Men', 'Youth A'),
    ('spring-send-youth', 'Women', 'Youth A'),
    ('spring-send-youth', 'Men', 'Junior'),
    ('spring-send-youth', 'Women', 'Junior'),

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
    ('spring-send-recreational', 'Check-in', 'check_in', 'All climbers', false, '8:00 AM', '8:45 AM', 96, null::text[]),
    ('spring-send-recreational', 'Welcome briefing', 'technical_meeting', 'Athletes and volunteers', false, '8:45 AM', '9:00 AM', 96, null::text[]),
    ('spring-send-recreational', 'Rec / Masters Session', 'qualifier_round', 'Morning scramble window', true, '9:00 AM', '11:15 AM', 48, array['Rec','Masters']::text[]),
    ('spring-send-recreational', 'Open Session', 'qualifier_round', 'Late scramble window', false, '11:35 AM', '1:50 PM', 48, array['Open']::text[]),
    ('spring-send-recreational', 'Score verification', 'custom', 'Officials', false, '1:50 PM', '2:15 PM', 20, null::text[]),
    ('spring-send-recreational', 'Community awards', 'results', 'All climbers', false, '2:30 PM', '3:00 PM', 96, null::text[]),

    ('spring-send-youth', 'Check-in', 'check_in', 'All athletes', false, '7:45 AM', '8:30 AM', 120, null::text[]),
    ('spring-send-youth', 'Judges briefing', 'custom', 'Officials', false, '8:30 AM', '8:45 AM', 30, null::text[]),
    ('spring-send-youth', 'Technical meeting', 'technical_meeting', 'Athletes and coaches', false, '8:45 AM', '9:00 AM', 120, null::text[]),
    ('spring-send-youth', 'Youth D / Youth C Wave', 'qualifier_round', 'Morning qualifier wave', false, '9:00 AM', '10:05 AM', 40, array['Youth D','Youth C']::text[]),
    ('spring-send-youth', 'Youth B / Youth A Wave', 'qualifier_round', 'Late morning qualifier wave', true, '10:15 AM', '11:25 AM', 40, array['Youth B','Youth A']::text[]),
    ('spring-send-youth', 'Junior Wave', 'qualifier_round', 'Junior qualifier wave', false, '11:35 AM', '12:25 PM', 40, array['Junior']::text[]),
    ('spring-send-youth', 'Isolation opens', 'isolation', 'Finalists', false, '1:30 PM', '1:50 PM', 24, null::text[]),
    ('spring-send-youth', 'Observation', 'observation', 'Finalists', false, '2:00 PM', '2:10 PM', 24, null::text[]),
    ('spring-send-youth', 'Finals', 'finals_round', 'Finalists', false, '2:15 PM', '4:45 PM', 24, null::text[]),
    ('spring-send-youth', 'Awards', 'results', 'All athletes', false, '5:00 PM', '5:30 PM', 120, null::text[]),

    ('mock-rec-scramble-live', 'Check-in', 'check_in', 'All climbers', false, '8:00 AM', '9:00 AM', 120, null::text[]),
    ('mock-rec-scramble-live', 'Judges briefing', 'custom', 'Officials', false, '9:00 AM', '9:15 AM', 24, null::text[]),
    ('mock-rec-scramble-live', 'Technical meeting', 'technical_meeting', 'Athletes and coaches', false, '9:15 AM', '9:30 AM', 120, null::text[]),
    ('mock-rec-scramble-live', 'Rec / Masters Session', 'qualifier_round', 'Morning scramble window', true, '9:30 AM', '12:00 PM', 60, array['Rec','Masters']::text[]),
    ('mock-rec-scramble-live', 'Open Session', 'qualifier_round', 'Midday scramble window', false, '12:15 PM', '2:45 PM', 60, array['Open']::text[]),
    ('mock-rec-scramble-live', 'Score verification', 'custom', 'Officials', false, '2:45 PM', '3:15 PM', 24, null::text[]),
    ('mock-rec-scramble-live', 'Results / Awards', 'results', 'All climbers', false, '3:30 PM', '4:00 PM', 120, null::text[]),

    ('mock-youth-series-live', 'Check-in', 'check_in', 'All athletes', false, '8:00 AM', '9:00 AM', 96, null::text[]),
    ('mock-youth-series-live', 'Judges briefing', 'custom', 'Officials', false, '9:00 AM', '9:15 AM', 24, null::text[]),
    ('mock-youth-series-live', 'Technical meeting', 'technical_meeting', 'Athletes and coaches', false, '9:15 AM', '9:30 AM', 96, null::text[]),
    ('mock-youth-series-live', 'Youth D / Youth C Wave', 'qualifier_round', 'Championship qualifier wave', false, '9:30 AM', '10:30 AM', 32, array['Youth D','Youth C']::text[]),
    ('mock-youth-series-live', 'Youth B / Youth A Wave', 'qualifier_round', 'Championship qualifier wave', true, '10:35 AM', '11:35 AM', 32, array['Youth B','Youth A']::text[]),
    ('mock-youth-series-live', 'Junior Wave', 'qualifier_round', 'Championship qualifier wave', false, '11:40 AM', '12:30 PM', 32, array['Junior']::text[]),
    ('mock-youth-series-live', 'Results review / Isolation open', 'custom', 'Finalists', false, '12:30 PM', '1:45 PM', 24, null::text[]),
    ('mock-youth-series-live', 'Isolation', 'isolation', 'Finalists', false, '1:45 PM', '2:00 PM', 24, null::text[]),
    ('mock-youth-series-live', 'Observation', 'observation', 'Finalists', false, '2:00 PM', '2:10 PM', 24, null::text[]),
    ('mock-youth-series-live', 'Finals', 'finals_round', 'Finalists', false, '2:10 PM', '5:00 PM', 24, null::text[]),
    ('mock-youth-series-live', 'Results / Awards', 'results', 'All athletes', false, '5:00 PM', '6:00 PM', 96, null::text[]),

    ('mock-flash-upcoming', 'Hall opens', 'custom', 'All athletes', false, '8:00 AM', '8:15 AM', 80, null::text[]),
    ('mock-flash-upcoming', 'Warm-up wall', 'custom', 'Qualified athletes', false, '8:15 AM', '8:30 AM', 40, null::text[]),
    ('mock-flash-upcoming', 'Check-in', 'check_in', 'All athletes', false, '8:30 AM', '9:00 AM', 80, null::text[]),
    ('mock-flash-upcoming', 'Technical meeting', 'technical_meeting', 'Athletes and coaches', false, '9:00 AM', '9:30 AM', 80, null::text[]),
    ('mock-flash-upcoming', 'Youth B / Youth A Rotation', 'qualifier_round', 'Day 1 qualifier rotation', false, '9:30 AM', '12:00 PM', 40, array['Youth B','Youth A']::text[]),
    ('mock-flash-upcoming', 'Junior / Open Rotation', 'qualifier_round', 'Day 1 qualifier rotation', false, '1:00 PM', '3:30 PM', 40, array['Junior','Open']::text[]),
    ('mock-flash-upcoming', 'Isolation', 'isolation', 'Finalists', false, '8:00 AM', '8:30 AM', 20, null::text[]),
    ('mock-flash-upcoming', 'Observation', 'observation', 'Finalists', false, '9:00 AM', '9:15 AM', 20, null::text[]),
    ('mock-flash-upcoming', 'Finals', 'finals_round', 'Finalists', false, '9:30 AM', '11:30 AM', 20, null::text[]),
    ('mock-flash-upcoming', 'Medal ceremony', 'results', 'All athletes', false, '5:00 PM', '5:30 PM', 80, null::text[]),

    ('mock-national-finals-live', 'Check-in', 'check_in', 'Finalists and guests', false, '3:45 PM', '4:15 PM', 120, null::text[]),
    ('mock-national-finals-live', 'Technical meeting', 'technical_meeting', 'Finalists', false, '4:15 PM', '4:25 PM', 24, null::text[]),
    ('mock-national-finals-live', 'Isolation', 'isolation', 'Finalists', false, '4:30 PM', '5:00 PM', 24, null::text[]),
    ('mock-national-finals-live', 'Observation', 'observation', 'Finalists', false, '5:05 PM', '5:20 PM', 24, null::text[]),
    ('mock-national-finals-live', 'Finalists presentation', 'custom', 'Finalists and spectators', false, '5:20 PM', '5:30 PM', 120, null::text[]),
    ('mock-national-finals-live', 'Finals', 'finals_round', 'Finalists', true, '5:30 PM', '7:00 PM', 24, null::text[]),
    ('mock-national-finals-live', 'Medal ceremony', 'results', 'All athletes', false, '7:20 PM', '7:45 PM', 120, null::text[]),

    ('mock-city-boulder-results', 'Check-in', 'check_in', 'All athletes', false, '3:30 PM', '4:00 PM', 90, null::text[]),
    ('mock-city-boulder-results', 'Technical meeting', 'technical_meeting', 'Finalists', false, '4:05 PM', '4:20 PM', 20, null::text[]),
    ('mock-city-boulder-results', 'Finalists call', 'custom', 'Finalists', false, '4:35 PM', '4:50 PM', 20, null::text[]),
    ('mock-city-boulder-results', 'Observation', 'observation', 'Finalists', false, '4:50 PM', '5:05 PM', 20, null::text[]),
    ('mock-city-boulder-results', 'Finals', 'finals_round', 'Finalists', false, '5:15 PM', '6:30 PM', 20, null::text[]),
    ('mock-city-boulder-results', 'Results posted', 'results', 'All athletes', true, '6:45 PM', '7:15 PM', 90, null::text[]),

    ('mock-scramble-upcoming', 'Check-in', 'check_in', 'All climbers', false, '9:00 AM', '9:45 AM', 140, null::text[]),
    ('mock-scramble-upcoming', 'Technical meeting', 'technical_meeting', 'Athletes and coaches', false, '9:45 AM', '10:00 AM', 140, null::text[]),
    ('mock-scramble-upcoming', 'Rec / Masters Session', 'qualifier_round', 'Early scramble window', false, '10:15 AM', '12:15 PM', 70, array['Rec','Masters']::text[]),
    ('mock-scramble-upcoming', 'Open Session', 'qualifier_round', 'Late scramble window', false, '12:45 PM', '2:45 PM', 70, array['Open']::text[]),
    ('mock-scramble-upcoming', 'Score verification', 'custom', 'Officials', false, '2:45 PM', '3:15 PM', 24, null::text[]),
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
where (
    c.slug like 'mock-%'
    or c.slug in ('spring-send-recreational', 'spring-send-youth')
  )
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
where (
    c.slug like 'mock-%'
    or c.slug in ('spring-send-recreational', 'spring-send-youth')
  )
  and coalesce(c.has_finals, true);

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
      when comp.slug = 'spring-send-recreational' and cat.age_group = 'Rec' then 14
      when comp.slug = 'spring-send-recreational' and cat.age_group = 'Open' then 12
      when comp.slug = 'spring-send-recreational' and cat.age_group = 'Masters' then 8

      when comp.slug = 'spring-send-youth' and cat.age_group in ('Youth D', 'Youth C') then 10
      when comp.slug = 'spring-send-youth' and cat.age_group in ('Youth B', 'Youth A') then 12
      when comp.slug = 'spring-send-youth' and cat.age_group = 'Junior' then 8

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
     or comp.slug in ('spring-send-recreational', 'spring-send-youth')
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
        'Andi Powell',
        'Bennett McCall',
        'Kai Hutchinson',
        'Korbin Glass',
        'Clare Hall',
        'Thomas Shannon',
        'Harlee Vega',
        'Aidan McFarland',
        'Annika Trevino',
        'Jaime Bauer',
        'Haley Walton',
        'Dominick Richards',
        'Trinity Medina',
        'George Wallace',
        'Arianna Reynolds',
        'Vincent Townsend',
        'Azalea McIntosh',
        'Kristian Duffy',
        'Addisyn Cabrera',
        'Cade Leal',
        'Murphy Maxwell',
        'Eden Torres',
        'Violet Owens',
        'Adriel Avalos',
        'Paloma Hogan',
        'Sonny Rodriguez',
        'Evelyn Mejia',
        'Atticus Carpenter',
        'Lilly Randall',
        'Trenton Wilson',
        'Luna Bridges',
        'Mohammed Goodwin',
        'Shiloh Williamson',
        'Emerson Kramer',
        'Hanna Cummings',
        'Raiden Hull',
        'Andi Huang',
        'Ayaan Paul',
        'Daphne Joseph',
        'Kyle Petersen',
        'Fernanda Greene',
        'Griffin Phan',
        'Elsa Wyatt',
        'Sam Suarez',
        'Jimena Daugherty',
        'Turner Ray',
        'Ruth Reyna',
        'Reginald Hoover',
        'Virginia Frank',
        'Braylen Higgins',
        'Leighton Valentine',
        'Demetrius Rasmussen',
        'Esperanza Spears',
        'Ameer Sweeney',
        'Yara Hoover',
        'Jaziel Wood',
        'Natalia Barr',
        'Harley Carr',
        'Rowan Pineda',
        'Gerardo Stout',
        'Chana Luna',
        'Erick Lowe',
        'Amari Yoder',
        'Johan Hunt',
        'Genevieve Bradshaw',
        'Emory Saunders',
        'Meadow Mosley',
        'Rayden Madden',
        'Violette Tate',
        'Dalton Gutierrez',
        'Savannah Dickson',
        'Maxton Hester',
        'Zendaya Wells',
        'Max Chambers',
        'Makayla Cooper',
        'Jonathan Armstrong',
        'Presley Pugh',
        'Judson Bowers',
        'Elisa Carey',
        'Watson Hammond',
        'Holly Phelps',
        'Hamza Tang',
        'Belle Powers',
        'Sean Delacruz',
        'Celine Potts',
        'Alfred Cantrell',
        'Yamileth Carson',
        'Ares Kent',
        'Jazmine Freeman',
        'Jayce Pruitt',
        'Brylee Buckley',
        'Aryan Ramirez',
        'Grace Delgado',
        'Colt Warren',
        'Sloane Costa',
        'Kenji Tyler',
        'Helena Barry',
        'Emery Dudley',
        'Hadleigh Rivera',
        'Charles Eaton',
        'Miley Vo',
        'Gordon Maldonado',
        'Elaina Bernal',
        'Eithan Sutton',
        'Izabella Zuniga',
        'Sincere Atkinson',
        'Jazmin Orozco',
        'Keanu Andrade',
        'Emmy Li',
        'Jorge Woodard',
        'Aubrie Kramer',
        'Kylan Diaz',
        'Elena Simon',
        'Zayne Woods',
        'Reese Moran',
        'Tate Hardy',
        'Jessica Jaramillo',
        'Riggs Davenport',
        'Adrianna Anthony',
        'Shiloh Clay',
        'Aliana Rangel',
        'Saint Walsh',
        'Leia Rodgers',
        'Mathias Hester',
        'Zendaya Harper',
        'Hayes Guevara',
        'Teresa Stafford',
        'Alfredo Gross',
        'Angel Guerra',
        'Leland Hamilton',
        'Mackenzie Arellano',
        'Kellan Kaur',
        'Holland Mullen',
        'Shepard Villegas',
        'Jessie Marks',
        'Amos Rush',
        'Maleah Wiggins',
        'Azariah Beard',
        'Ezra Bryant',
        'Jonah Stout',
        'Chana Mack',
        'Esteban Luna',
        'Journey Bradley',
        'Richard Kelly',
        'Ruby Luna',
        'Erick Shannon',
        'Harlee Gilbert',
        'Tobias Roth',
        'Elliot Jefferson',
        'Raylan Harrington',
        'Legacy Le',
        'Damien Proctor',
        'Chandler Arroyo',
        'Alberto Lambert',
        'Nina Contreras',
        'Emilio Chapman',
        'Zuri Hail',
        'Hector Walsh',
        'Leia Hart',
        'Joel Becker',
        'Laura Crane',
        'Fox McConnell',
        'Denise Livingston',
        'Ambrose Christensen',
        'Carmen Castro',
        'Jasper Lynch',
        'Malia Colon',
        'Bruce McMillan',
        'Oakleigh Green',
        'Anthony Bradley',
        'Vanessa Sims',
        'Brian Lambert',
        'Nina Robertson',
        'Emiliano Johns',
        'Giovanna Flowers',
        'Saul Buckley',
        'Theodora Mejia',
        'Atticus Gonzalez',
        'Abigail Burgess',
        'Kolton Andrade',
        'Emmy Rubio',
        'Titan Montgomery',
        'Evangeline Hodge',
        'Reign Miranda',
        'Amina Woods',
        'Zion Davis',
        'Mia Carey',
        'Watson Barnes',
        'Liliana Bond',
        'Roger Bentley',
        'Jaylin Lane',
        'Matias Decker',
        'Aleena Carson',
        'Ares Ramsey',
        'Lyric Noble',
        'Idris George',
        'Adelyn Wade',
        'Jake Riley',
        'Kayla Schneider',
        'Raymond Jennings',
        'Palmer Terrell',
        'Jaxen Pugh',
        'Landry Sharp',
        'Royce Heath',
        'Amani Munoz',
        'Justin Rubio',
        'Hadassah McCarthy',
        'Devin Dickerson',
        'Opal Medina',
        'George Huang',
        'Francesca Becker',
        'Lawson Todd',
        'Zariah Jimenez',
        'Silas Bauer',
        'Haley Bruce',
        'Uriah Pham',
        'Raelyn Graves',
        'Cesar Jefferson',
        'Julieta Vargas',
        'Ryker Crosby',
        'Keily Morton',
        'Roland Valenzuela',
        'Henley Yoder',
        'Johan Mercado',
        'Mckinley Gaines',
        'Talon Pugh',
        'Landry Benton',
        'Jamal Knox',
        'Kallie Ali',
        'Arjun Shepherd',
        'Katalina Cantu',
        'Anakin Martin',
        'Mila Morrow',
        'Kyree Person',
        'Dylan Phelps',
        'Hamza Wells',
        'Cecilia Marsh',
        'Bo Burke',
        'Vera Williamson',
        'Emerson Kim',
        'Skye O''Donnell',
        'Callahan O''Neill',
        'Ellianna O''Connell',
        'Hadlee O''Connor',
        'Brantley O''Neal',
        'Capri O''Connell',
        'Coraline Macdonald',
        'Andi Avalos',
        'Bennett Greene',
        'Kai Pineda',
        'Korbin Armstrong',
        'Clare Delgado',
        'Thomas Woodard',
        'Harlee Guerra',
        'Aidan Harrington',
        'Annika McMillan',
        'Jaime Decker',
        'Haley Pham',
        'Dominick Burke',
        'Trinity Bauer',
        'George Mejia',
        'Arianna Suarez',
        'Vincent Lowe',
        'Azalea Carey',
        'Kristian Tyler',
        'Addisyn Woods',
        'Cade Kaur',
        'Murphy Arroyo',
        'Eden Robertson',
        'Violet George',
        'Adriel Crosby',
        'Paloma O''Neill',
        'Sonny Medina',
        'Evelyn Wilson',
        'Atticus Reyna',
        'Lilly Bradshaw',
        'Trenton Tang',
        'Luna Rivera',
        'Mohammed Jaramillo',
        'Shiloh Marks',
        'Emerson Chapman',
        'Hanna Gonzalez',
        'Raiden Schneider',
        'Ayaan Mercado',
        'Daphne O''Neal',
        'Kyle Townsend',
        'Fernanda Williamson',
        'Griffin Higgins',
        'Elsa Madden',
        'Sam Potts',
        'Jimena Maldonado',
        'Turner Clay',
        'Ruth Beard',
        'Reginald Becker',
        'Virginia Montgomery',
        'Braylen Sharp',
        'Leighton Knox',
        'Demetrius McCall',
        'Esperanza Cabrera',
        'Ameer Hull',
        'Yara Spears',
        'Jaziel Dickson',
        'Natalia Kent',
        'Harley Zuniga',
        'Rowan Rodgers',
        'Gerardo Bradley',
        'Chana Livingston',
        'Erick Davis',
        'Amari McCarthy',
        'Johan Cantu',
        'Genevieve Hall',
        'Emory Torres',
        'Meadow Joseph',
        'Rayden Barr',
        'Violette Chambers',
        'Dalton Buckley',
        'Savannah Andrade',
        'Maxton Stafford',
        'Zendaya Roth',
        'Max Lynch',
        'Makayla Bentley',
        'Jonathan Jimenez',
        'Presley Person',
        'Judson McFarland',
        'Elisa Hogan',
        'Watson Phan',
        'Holly Stout',
        'Hamza Pugh',
        'Belle Warren',
        'Sean Diaz',
        'Celine Hamilton',
        'Alfred Le',
        'Yamileth Green',
        'Jazmine Graves',
        'Jayce Kim',
        'Brylee Walton',
        'Aryan Carpenter',
        'Grace Daugherty',
        'Colt Yoder',
        'Sloane Hammond',
        'Kenji Barry',
        'Helena Moran',
        'Emery Mullen',
        'Hadleigh Lambert',
        'Charles Johns',
        'Miley Wade',
        'Gordon Morton',
        'Elaina O''Connell',
        'Eithan Wallace',
        'Izabella Bridges',
        'Sincere Hoover',
        'Jazmin Saunders',
        'Keanu Powers',
        'Emmy Eaton',
        'Jorge Davenport',
        'Aubrie Rush',
        'Kylan Hail',
        'Elena Burgess',
        'Zayne Jennings',
        'Reese Gaines',
        'Tate Macdonald',
        'Jessica McIntosh',
        'Riggs Kramer',
        'Adrianna Valentine',
        'Aliana Tate',
        'Saint Cantrell',
        'Leia Bernal',
        'Mathias Rangel',
        'Hayes Bryant',
        'Teresa Crane',
        'Alfredo Hodge',
        'Angel Heath',
        'Leland Ali',
        'Mackenzie Hutchinson',
        'Kellan Leal',
        'Holland Huang',
        'Shepard Sweeney',
        'Jessie Hester',
        'Amos Freeman',
        'Maleah Atkinson',
        'Azariah Harper',
        'Ezra Kelly',
        'Jonah Christensen',
        'Esteban Barnes',
        'Journey Dickerson',
        'Richard Martin',
        'Ruby Shannon',
        'Tobias Owens',
        'Elliot Petersen',
        'Raylan Carr',
        'Legacy Cooper',
        'Damien Ramirez',
        'Chandler Li',
        'Alberto Gross',
        'Nina Jefferson',
        'Emilio Colon',
        'Zuri Lane',
        'Hector Bruce',
        'Joel Marsh',
        'Laura Trevino',
        'Fox Rodriguez',
        'Denise Wyatt',
        'Ambrose Luna',
        'Carmen Bowers',
        'Jasper Costa',
        'Malia Simon',
        'Bruce Arellano',
        'Oakleigh Proctor',
        'Anthony Sims',
        'Vanessa Noble',
        'Brian Vargas',
        'Emiliano O''Donnell',
        'Giovanna Richards',
        'Saul Randall',
        'Theodora Ray',
        'Abigail Hunt',
        'Kolton Phelps',
        'Titan Dudley',
        'Evangeline Hardy',
        'Reign Villegas',
        'Amina Contreras',
        'Zion Flowers',
        'Mia Riley',
        'Liliana Valenzuela',
        'Roger O''Connor',
        'Jaylin Reynolds',
        'Matias Goodwin',
        'Aleena Frank',
        'Lyric Mosley',
        'Idris Delacruz',
        'Adelyn Vo',
        'Jake Anthony',
        'Kayla Wiggins',
        'Raymond Hart',
        'Palmer Rubio',
        'Jaxen Terrell',
        'Royce Powell',
        'Amani Duffy',
        'Justin Cummings',
        'Hadassah Rasmussen',
        'Devin Gutierrez',
        'Opal Carson',
        'Francesca Sutton',
        'Lawson Walsh',
        'Zariah Mack',
        'Silas McConnell',
        'Uriah Miranda',
        'Raelyn Munoz',
        'Cesar Shepherd',
        'Julieta Glass',
        'Ryker Maxwell',
        'Keily Paul',
        'Roland Wood',
        'Henley Wells',
        'Mckinley Pruitt',
        'Talon Orozco',
        'Jamal Guevara',
        'Kallie Gilbert',
        'Arjun Castro',
        'Katalina Bond',
        'Anakin Todd',
        'Kyree Vega',
        'Dylan Avalos',
        'Cecilia Greene',
        'Bo Pineda',
        'Vera Armstrong',
        'Skye Delgado',
        'Callahan Woodard',
        'Ellianna Guerra',
        'Hadlee Harrington',
        'Brantley McMillan',
        'Capri Decker',
        'Coraline Pham',
        'A''isha Burke',
        'A-jay Bauer',
        'Aab Mejia',
        'Aaban Suarez',
        'Aaberg Lowe',
        'Aabid Carey',
        'Aabidah Tyler',
        'Aabish Woods',
        'Aaby Kaur',
        'Aadam Arroyo',
        'Aadarsh Robertson',
        'Andi George',
        'Bennett Crosby',
        'Kai O''Neill',
        'Korbin Medina',
        'Clare Wilson',
        'Thomas Reyna',
        'Harlee Bradshaw',
        'Aidan Tang',
        'Annika Rivera',
        'Jaime Jaramillo',
        'Haley Marks',
        'Dominick Chapman',
        'Trinity Gonzalez',
        'George Schneider',
        'Arianna Mercado',
        'Vincent O''Neal',
        'Azalea Townsend',
        'Kristian Williamson',
        'Addisyn Higgins',
        'Cade Madden',
        'Murphy Potts',
        'Eden Maldonado',
        'Violet Clay',
        'Adriel Beard',
        'Paloma Becker',
        'Sonny Montgomery',
        'Evelyn Sharp',
        'Atticus Knox',
        'Lilly McCall',
        'Trenton Cabrera',
        'Luna Hull',
        'Mohammed Spears',
        'Shiloh Dickson',
        'Emerson Kent',
        'Hanna Zuniga',
        'Raiden Rodgers',
        'Ayaan Bradley',
        'Daphne Livingston',
        'Kyle Davis',
        'Fernanda McCarthy',
        'Griffin Cantu',
        'Elsa Hall',
        'Sam Torres',
        'Jimena Joseph',
        'Turner Barr',
        'Ruth Chambers',
        'Reginald Buckley',
        'Virginia Andrade',
        'Braylen Stafford',
        'Leighton Roth',
        'Demetrius Lynch',
        'Esperanza Bentley',
        'Ameer Jimenez',
        'Yara Person',
        'Jaziel McFarland',
        'Natalia Hogan',
        'Harley Phan',
        'Rowan Stout',
        'Gerardo Pugh',
        'Chana Warren',
        'Erick Diaz',
        'Amari Hamilton',
        'Johan Le',
        'Genevieve Green',
        'Emory Ramsey',
        'Meadow Graves',
        'Rayden Kim',
        'Violette Walton',
        'Dalton Carpenter',
        'Savannah Daugherty',
        'Maxton Yoder',
        'Zendaya Hammond',
        'Max Barry',
        'Makayla Moran',
        'Jonathan Mullen',
        'Presley Lambert',
        'Judson Johns',
        'Elisa Wade',
        'Watson Morton',
        'Holly O''Connell',
        'Hamza Wallace',
        'Belle Bridges',
        'Sean Hoover',
        'Celine Saunders',
        'Alfred Powers',
        'Yamileth Eaton',
        'Ares Davenport',
        'Jazmine Rush',
        'Jayce Hail',
        'Brylee Burgess',
        'Aryan Jennings',
        'Grace Gaines',
        'Colt Macdonald',
        'Sloane McIntosh',
        'Kenji Kramer',
        'Helena Valentine',
        'Emery Tate',
        'Hadleigh Cantrell',
        'Charles Bernal',
        'Miley Rangel',
        'Gordon Bryant',
        'Elaina Crane',
        'Eithan Hodge',
        'Izabella Heath',
        'Sincere Ali',
        'Jazmin Hutchinson',
        'Keanu Leal',
        'Emmy Huang',
        'Jorge Sweeney',
        'Aubrie Hester',
        'Kylan Freeman',
        'Elena Atkinson',
        'Zayne Harper',
        'Reese Kelly',
        'Tate Christensen',
        'Jessica Barnes',
        'Riggs Dickerson',
        'Adrianna Martin',
        'Aliana Shannon',
        'Saint Owens',
        'Leia Petersen',
        'Mathias Carr',
        'Hayes Cooper',
        'Teresa Ramirez',
        'Alfredo Li',
        'Angel Gross',
        'Leland Jefferson',
        'Mackenzie Colon',
        'Kellan Lane',
        'Holland Bruce',
        'Shepard Marsh',
        'Jessie Trevino',
        'Amos Rodriguez',
        'Maleah Wyatt',
        'Azariah Luna',
        'Ezra Bowers',
        'Jonah Costa',
        'Esteban Simon',
        'Journey Arellano',
        'Richard Proctor',
        'Ruby Sims',
        'Tobias Noble',
        'Elliot Vargas',
        'Raylan O''Donnell',
        'Legacy Richards',
        'Damien Randall',
        'Chandler Ray',
        'Alberto Hunt',
        'Nina Phelps',
        'Emilio Dudley',
        'Zuri Hardy',
        'Hector Villegas',
        'Joel Contreras',
        'Laura Flowers',
        'Fox Riley',
        'Denise Valenzuela',
        'Ambrose O''Connor',
        'Carmen Reynolds',
        'Jasper Goodwin',
        'Malia Frank',
        'Bruce Mosley',
        'Oakleigh Delacruz',
        'Anthony Vo',
        'Vanessa Anthony',
        'Brian Wiggins',
        'Emiliano Hart',
        'Giovanna Rubio',
        'Saul Terrell',
        'Theodora Benton',
        'Abigail Powell',
        'Kolton Duffy',
        'Titan Cummings',
        'Evangeline Rasmussen',
        'Reign Gutierrez',
        'Amina Carson',
        'Zion Sutton',
        'Mia Walsh',
        'Liliana Mack',
        'Roger McConnell',
        'Jaylin Miranda',
        'Matias Munoz',
        'Aleena Shepherd',
        'Lyric Glass',
        'Idris Maxwell',
        'Adelyn Paul',
        'Jake Wood',
        'Kayla Wells',
        'Raymond Pruitt',
        'Palmer Orozco',
        'Jaxen Guevara',
        'Landry Gilbert',
        'Royce Castro',
        'Amani Bond',
        'Justin Todd',
        'Hadassah Morrow',
        'Devin Vega',
        'Opal Avalos',
        'Francesca Greene',
        'Lawson Pineda',
        'Zariah Armstrong',
        'Silas Delgado',
        'Uriah Woodard',
        'Raelyn Guerra',
        'Cesar Harrington',
        'Julieta McMillan',
        'Ryker Decker',
        'Keily Pham',
        'Roland Burke',
        'Henley Bauer',
        'Mckinley Mejia',
        'Talon Suarez',
        'Jamal Lowe',
        'Kallie Carey',
        'Arjun Tyler',
        'Katalina Woods',
        'Anakin Kaur',
        'Mila Arroyo',
        'Kyree Robertson',
        'Dylan George',
        'Cecilia Crosby',
        'Bo O''Neill',
        'Vera Medina',
        'Skye Wilson',
        'Callahan Reyna',
        'Ellianna Bradshaw',
        'Hadlee Tang',
        'Brantley Rivera',
        'Capri Jaramillo',
        'Coraline Marks',
        'A''isha Chapman',
        'A-jay Gonzalez',
        'Aab Schneider',
        'Aaban Mercado',
        'Aaberg O''Neal',
        'Aabid Townsend',
        'Aabidah Williamson',
        'Aabish Higgins',
        'Aaby Madden',
        'Aadam Potts',
        'Aadarsh Maldonado',
        'Andi Clay',
        'Bennett Beard',
        'Kai Becker',
        'Korbin Montgomery',
        'Clare Sharp',
        'Thomas Knox',
        'Harlee McCall',
        'Aidan Cabrera',
        'Annika Hull',
        'Jaime Spears',
        'Haley Dickson',
        'Dominick Kent',
        'Trinity Zuniga',
        'George Rodgers',
        'Arianna Bradley',
        'Vincent Livingston',
        'Azalea Davis',
        'Kristian McCarthy',
        'Addisyn Cantu',
        'Cade Hall',
        'Murphy Torres',
        'Eden Joseph',
        'Violet Barr',
        'Adriel Chambers',
        'Paloma Buckley',
        'Sonny Andrade',
        'Evelyn Stafford',
        'Atticus Roth',
        'Lilly Lynch',
        'Trenton Bentley',
        'Luna Jimenez',
        'Mohammed Person',
        'Shiloh McFarland',
        'Emerson Hogan',
        'Hanna Phan',
        'Raiden Stout',
        'Ayaan Pugh',
        'Daphne Warren',
        'Kyle Diaz',
        'Fernanda Hamilton',
        'Griffin Le',
        'Elsa Green',
        'Sam Ramsey',
        'Jimena Graves',
        'Turner Kim',
        'Ruth Walton',
        'Reginald Carpenter',
        'Virginia Daugherty',
        'Braylen Yoder',
        'Leighton Hammond',
        'Demetrius Barry',
        'Esperanza Moran',
        'Ameer Mullen',
        'Yara Lambert',
        'Jaziel Johns',
        'Natalia Wade',
        'Harley Morton',
        'Rowan O''Connell',
        'Gerardo Wallace',
        'Chana Bridges',
        'Erick Hoover',
        'Amari Saunders',
        'Johan Powers',
        'Genevieve Eaton',
        'Emory Davenport',
        'Meadow Rush',
        'Rayden Hail',
        'Violette Burgess',
        'Dalton Jennings',
        'Savannah Gaines',
        'Maxton Macdonald',
        'Zendaya McIntosh',
        'Max Kramer',
        'Makayla Valentine',
        'Jonathan Tate',
        'Presley Cantrell',
        'Judson Bernal',
        'Elisa Rangel',
        'Watson Bryant',
        'Holly Crane',
        'Hamza Hodge',
        'Belle Heath',
        'Sean Ali',
        'Celine Hutchinson',
        'Alfred Leal',
        'Yamileth Huang',
        'Ares Sweeney',
        'Jazmine Hester',
        'Jayce Freeman',
        'Brylee Atkinson',
        'Aryan Harper',
        'Grace Kelly',
        'Colt Christensen',
        'Sloane Barnes',
        'Kenji Dickerson',
        'Helena Martin',
        'Emery Shannon',
        'Hadleigh Owens',
        'Charles Petersen',
        'Miley Carr',
        'Gordon Cooper',
        'Elaina Ramirez',
        'Eithan Li',
        'Izabella Gross',
        'Sincere Jefferson',
        'Jazmin Colon',
        'Keanu Lane',
        'Emmy Bruce',
        'Jorge Marsh',
        'Aubrie Trevino',
        'Kylan Rodriguez',
        'Elena Wyatt',
        'Zayne Luna',
        'Reese Bowers',
        'Tate Costa',
        'Jessica Simon',
        'Riggs Arellano',
        'Adrianna Proctor',
        'Aliana Sims',
        'Saint Noble'
      ]
    )[1 + ((na.global_sequence - 1) % 844)] as name,
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
      when na.slug = 'spring-send-recreational' and na.age_group in ('Rec', 'Masters') then
        (
          select csb.id
          from public.competition_schedule_blocks csb
          where csb.competition_id = na.competition_id
            and csb.label = 'Rec / Masters Session'
          limit 1
        )
      when na.slug = 'spring-send-recreational' and na.age_group = 'Open' then
        (
          select csb.id
          from public.competition_schedule_blocks csb
          where csb.competition_id = na.competition_id
            and csb.label = 'Open Session'
          limit 1
        )
      when na.slug = 'spring-send-youth' and na.age_group in ('Youth D', 'Youth C') then
        (
          select csb.id
          from public.competition_schedule_blocks csb
          where csb.competition_id = na.competition_id
            and csb.label = 'Youth D / Youth C Wave'
          limit 1
        )
      when na.slug = 'spring-send-youth' and na.age_group in ('Youth B', 'Youth A') then
        (
          select csb.id
          from public.competition_schedule_blocks csb
          where csb.competition_id = na.competition_id
            and csb.label = 'Youth B / Youth A Wave'
          limit 1
        )
      when na.slug = 'spring-send-youth' and na.age_group = 'Junior' then
        (
          select csb.id
          from public.competition_schedule_blocks csb
          where csb.competition_id = na.competition_id
            and csb.label = 'Junior Wave'
          limit 1
        )
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

-- 6. Seed live boulder queue traffic for active scramble sessions.
with live_scramble_blocks as (
  select
    c.id as competition_id,
    c.slug,
    c.total_climbs,
    csb.id as schedule_block_id
  from public.competitions c
  join public.competition_schedule_blocks csb
    on csb.competition_id = c.id
   and csb.is_active = true
   and csb.phase_type = 'qualifier_round'
  where c.slug in ('spring-send-recreational', 'mock-rec-scramble-live')
    and c.format = 'scramble'
    and c.current_phase = 'qualifier_open'
),
queued_climbers as (
  select
    lsb.competition_id,
    lsb.slug,
    lsb.total_climbs,
    lsb.schedule_block_id,
    c.id as climber_id,
    row_number() over (
      partition by lsb.competition_id
      order by c.climber_number, c.name
    ) as queue_seed
  from live_scramble_blocks lsb
  join public.climbers c
    on c.competition_id = lsb.competition_id
   and c.time_slot_id = lsb.schedule_block_id
),
materialized_queue as (
  select
    competition_id,
    climber_id,
    schedule_block_id,
    least(
      total_climbs,
      case
        when slug = 'spring-send-recreational' then
          case
            when queue_seed in (1, 2, 3, 4) then 2
            when queue_seed in (5, 6, 7) then 5
            when queue_seed in (8, 9) then 8
            when queue_seed = 10 then 12
            when queue_seed = 11 then 16
            else 20
          end
        else
          case
            when queue_seed in (1, 2, 3, 4, 5) then 3
            when queue_seed in (6, 7, 8) then 6
            when queue_seed in (9, 10) then 9
            when queue_seed = 11 then 14
            else 18
          end
      end
    ) as climb_number,
    now()
      - (
        case
          when slug = 'spring-send-recreational' then ((queue_seed - 1) * 11 + 8)
          else ((queue_seed - 1) * 13 + 12)
        end || ' seconds'
      )::interval as checked_in_at
  from queued_climbers
  where queue_seed <= 12
)
insert into public.competition_boulder_queue (
  competition_id,
  climber_id,
  schedule_block_id,
  climb_number,
  checked_in_at
)
select
  competition_id,
  climber_id,
  schedule_block_id,
  climb_number,
  checked_in_at
from materialized_queue;

-- 7. Seed qualifier attempts for live/finals/results competitions,
--    including the live Spring Send youth qualifier.
with scored_events as (
  select id, slug, format, total_climbs
  from public.competitions
  where slug in (
    'spring-send-recreational',
    'spring-send-youth',
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
    se.total_climbs,
    c.age_group,
    c.gender_division,
    gs.climb_number,
    get_byte(decode(md5(c.id::text || ':profile:a'), 'hex'), 0) as profile_seed_a,
    get_byte(decode(md5(c.id::text || ':profile:b'), 'hex'), 0) as profile_seed_b,
    get_byte(decode(md5(c.id::text || ':profile:c'), 'hex'), 0) as profile_seed_c,
    get_byte(decode(md5(c.id::text || ':profile:d'), 'hex'), 0) as profile_seed_d,
    get_byte(decode(md5(c.id::text || ':profile:e'), 'hex'), 0) as profile_seed_e,
    get_byte(decode(md5(c.id::text || ':' || gs.climb_number::text || ':a'), 'hex'), 0) as seed_a,
    get_byte(decode(md5(c.id::text || ':' || gs.climb_number::text || ':b'), 'hex'), 0) as seed_b,
    get_byte(decode(md5(c.id::text || ':' || gs.climb_number::text || ':c'), 'hex'), 0) as seed_c,
    get_byte(decode(md5(c.id::text || ':' || gs.climb_number::text || ':d'), 'hex'), 0) as seed_d,
    get_byte(decode(md5(c.id::text || ':' || gs.climb_number::text || ':e'), 'hex'), 0) as seed_e
  from public.climbers c
  join scored_events se
    on se.id = c.competition_id
  cross join lateral generate_series(1, se.total_climbs) as gs(climb_number)
),
athlete_profiles as (
  select distinct on (competition_id, climber_id)
    competition_id,
    climber_id,
    slug,
    format,
    total_climbs,
    age_group,
    gender_division,
    case age_group
      when 'Rec' then 8.9
      when 'Masters' then 9.8
      when 'Youth D' then 9.6
      when 'Youth C' then 10.4
      when 'Youth B' then 11.8
      when 'Youth A' then 12.6
      when 'Junior' then 13.4
      else 12.2
    end
      + case gender_division when 'Men' then 0.8 when 'Women' then 0.35 else 0.15 end
      + case slug
        when 'spring-send-recreational' then -0.8
        when 'mock-rec-scramble-live' then -0.5
        when 'spring-send-youth' then 0.35
        when 'mock-youth-series-live' then 0.55
        when 'mock-national-finals-live' then 1.1
        when 'mock-city-boulder-results' then 0.85
        else 0
      end
      + round(((profile_seed_a::numeric / 255) * 4.8) - 2.4, 2) as base_strength,
    4 + (profile_seed_b % 7) as consistency_band,
    4 + (profile_seed_c % 8) as endurance_band,
    3 + (profile_seed_d % 6) as volatility_band,
    (profile_seed_e % 9) - 4 as upset_band
  from attempt_source
  order by competition_id, climber_id
),
attempt_outcomes as (
  select
    src.competition_id,
    src.climber_id,
    src.climb_number,
    src.slug,
    src.format,
    src.total_climbs,
    case
      when src.format = 'scramble' then
        src.climb_number <= least(src.total_climbs, 10 + ap.endurance_band + (src.seed_a % 8))
      else
        src.climb_number <= least(src.total_climbs, 5 + ap.endurance_band + (src.seed_a % 4))
    end as attempted,
    (
      ap.base_strength
      + (ap.consistency_band * 0.34)
      + case when src.climb_number <= greatest(3, least(5, src.total_climbs / 3)) then 0.7 else 0 end
      - greatest(src.climb_number - ap.endurance_band, 0) * case when src.format = 'scramble' then 0.08 else 0.16 end
      + ((src.seed_c % 11) - 5) * 0.22
      + (ap.upset_band * case when (src.seed_d % 7) = 0 then 0.34 else 0.09 end)
    ) as performance_rating,
    (
      case src.slug
        when 'spring-send-recreational' then 8.6
        when 'mock-rec-scramble-live' then 9.1
        when 'spring-send-youth' then 10.4
        when 'mock-youth-series-live' then 10.8
        when 'mock-national-finals-live' then 11.7
        when 'mock-city-boulder-results' then 11.2
        else 10.3
      end
      + src.climb_number * case when src.format = 'scramble' then 0.34 else 0.56 end
      + ((src.seed_b % 9) - 4) * 0.17
      + case when src.climb_number > (src.total_climbs * 3 / 4) then 0.75 else 0 end
    ) as difficulty_rating,
    case
      when (
        ap.base_strength
        + (ap.consistency_band * 0.34)
        + case when src.climb_number <= greatest(3, least(5, src.total_climbs / 3)) then 0.7 else 0 end
        - greatest(src.climb_number - ap.endurance_band, 0) * case when src.format = 'scramble' then 0.08 else 0.16 end
        + ((src.seed_c % 11) - 5) * 0.22
        + (ap.upset_band * case when (src.seed_d % 7) = 0 then 0.34 else 0.09 end)
      ) - (
        case src.slug
          when 'spring-send-recreational' then 8.6
          when 'mock-rec-scramble-live' then 9.1
          when 'spring-send-youth' then 10.4
          when 'mock-youth-series-live' then 10.8
          when 'mock-national-finals-live' then 11.7
          when 'mock-city-boulder-results' then 11.2
          else 10.3
        end
        + src.climb_number * case when src.format = 'scramble' then 0.34 else 0.56 end
        + ((src.seed_b % 9) - 4) * 0.17
        + case when src.climb_number > (src.total_climbs * 3 / 4) then 0.75 else 0 end
      ) >= case when src.format = 'scramble' then 0.25 else 0.95 end
        then true
      else false
    end as topped_raw,
    case
      when src.format = 'scramble' then false
      when (
        ap.base_strength
        + (ap.consistency_band * 0.34)
        + case when src.climb_number <= greatest(3, least(5, src.total_climbs / 3)) then 0.7 else 0 end
        - greatest(src.climb_number - ap.endurance_band, 0) * case when src.format = 'scramble' then 0.08 else 0.16 end
        + ((src.seed_c % 11) - 5) * 0.22
        + (ap.upset_band * case when (src.seed_d % 7) = 0 then 0.34 else 0.09 end)
        + 1.4
      ) - (
        case src.slug
          when 'spring-send-recreational' then 8.6
          when 'mock-rec-scramble-live' then 9.1
          when 'spring-send-youth' then 10.4
          when 'mock-youth-series-live' then 10.8
          when 'mock-national-finals-live' then 11.7
          when 'mock-city-boulder-results' then 11.2
          else 10.3
        end
        + src.climb_number * case when src.format = 'scramble' then 0.34 else 0.56 end
        + ((src.seed_b % 9) - 4) * 0.17
        + case when src.climb_number > (src.total_climbs * 3 / 4) then 0.75 else 0 end
      ) >= 0.15
        then true
      else false
    end as zone_raw,
    case
      when src.format = 'scramble' then
        greatest(1, least(6, 2 + (src.seed_b % 3) + greatest(src.climb_number - ap.endurance_band, 0) / 3))
      else
        greatest(1, least(5, 1 + (src.seed_b % 2) + greatest(src.climb_number - ap.consistency_band, 0) / 4))
    end as top_tries,
    case
      greatest(1, least(6, 2 + (src.seed_c % 3) + greatest(src.climb_number - ap.endurance_band, 0) / 3))
        as zone_tries,
    case
      when src.format = 'scramble' then 1 + (src.seed_d % 4)
      else 2 + (src.seed_e % 4)
    end as generic_tries
  from attempt_source src
  join athlete_profiles ap
    on ap.competition_id = src.competition_id
   and ap.climber_id = src.climber_id
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
    case
      when format = 'scramble' and (climb_number <= 10 or ((climb_number + generic_tries) % 4) <> 0) then 'climber'
      when format = 'scramble' then 'staff'
      when ((climb_number + generic_tries + top_tries) % 3) = 0 then 'climber'
      else 'staff'
    end as entered_by
  from attempt_outcomes
  where attempted
    and not (
      format <> 'scramble'
      and climb_number > greatest(4, total_climbs - 2)
      and ((competition_id::text || ':' || climber_id::text || ':' || climb_number::text) is not null)
      and generic_tries >= 5
      and ((climb_number + generic_tries + zone_tries) % 5) = 0
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

-- 8. Persist finalists for finals-live and results events using the official scoring function.
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

-- 9. Seed finals attempts:
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
finalist_profiles as (
  select
    fe.competition_id,
    fe.slug,
    fe.current_phase,
    fe.finals_problem_count,
    cf.climber_id,
    cf.qualifier_rank,
    cf.age_group,
    cf.gender_division,
    13.4
      - least(cf.qualifier_rank, 10) * 0.42
      + case cf.age_group when 'Junior' then 0.2 else 0.7 end
      + case cf.gender_division when 'Men' then 0.25 when 'Women' then 0.15 else 0 end
      + round((((get_byte(decode(md5(cf.climber_id::text || ':final-profile'), 'hex'), 0))::numeric / 255) * 2.8) - 1.4, 2) as finals_strength,
    4 + (get_byte(decode(md5(cf.climber_id::text || ':final-consistency'), 'hex'), 0) % 5) as consistency_band,
    3 + (get_byte(decode(md5(cf.climber_id::text || ':final-volatility'), 'hex'), 0) % 5) as volatility_band
  from finals_events fe
  join public.competition_finalists cf
    on cf.competition_id = fe.competition_id
),
final_attempt_source as (
  select
    fp.competition_id,
    fp.slug,
    fp.current_phase,
    fp.climber_id,
    fp.qualifier_rank,
    fp.finals_strength,
    fp.consistency_band,
    fp.volatility_band,
    gs.climb_number,
    get_byte(decode(md5(fp.climber_id::text || ':' || gs.climb_number::text || ':fa'), 'hex'), 0) as seed_a,
    get_byte(decode(md5(fp.climber_id::text || ':' || gs.climb_number::text || ':fb'), 'hex'), 0) as seed_b,
    get_byte(decode(md5(fp.climber_id::text || ':' || gs.climb_number::text || ':fc'), 'hex'), 0) as seed_c
  from finalist_profiles fp
  cross join lateral generate_series(1, fp.finals_problem_count) as gs(climb_number)
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
    (
      finals_strength
      + (consistency_band * 0.32)
      - qualifier_rank * 0.08
      + (((seed_a % 11) - 5) * 0.18)
      + (((seed_b % 7) - 3) * 0.12)
    ) >= (
      14.1
      + climb_number * 0.78
      + (((seed_c % 9) - 4) * 0.14)
      + 0.65
    ) as top_raw,
    (
      finals_strength
      + (consistency_band * 0.32)
      - qualifier_rank * 0.08
      + (((seed_a % 11) - 5) * 0.18)
      + (((seed_b % 7) - 3) * 0.12)
      + 1.1
    ) >= (
      14.1
      + climb_number * 0.78
      + (((seed_c % 9) - 4) * 0.14)
    ) as zone_raw,
    greatest(1, least(4, 1 + (seed_b % 3) + greatest(climb_number - consistency_band, 0) / 3)) as top_tries,
    greatest(1, least(5, 1 + (seed_c % 3) + greatest(climb_number - volatility_band, 0) / 3)) as zone_tries
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

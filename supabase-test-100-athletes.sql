do $$
begin
  if to_regclass('public.competitions') is null then
    raise exception 'Missing multi-competition schema. Run supabase-repair.sql or supabase-schema.sql first.';
  end if;

  if to_regclass('public.final_attempts') is not null then
    execute 'delete from public.final_attempts';
  end if;
  if to_regclass('public.competition_finalists') is not null then
    execute 'delete from public.competition_finalists';
  end if;
  if to_regclass('public.qualifier_attempts') is not null then
    execute 'delete from public.qualifier_attempts';
  end if;
  if to_regclass('public.climbers') is not null then
    execute 'delete from public.climbers';
  end if;
  if to_regclass('public.competition_schedule_blocks') is not null then
    execute 'delete from public.competition_schedule_blocks';
  end if;
  if to_regclass('public.competition_categories') is not null then
    execute 'delete from public.competition_categories';
  end if;

  execute 'delete from public.competitions';
end $$;

with inserted_competitions as (
  insert into public.competitions (
    id,
    slug,
    name,
    status,
    format,
    discipline_label,
    stage_mode,
    location_name,
    start_date,
    end_date,
    registration_opens_at,
    registration_closes_at,
    description,
    total_climbs,
    max_climbers,
    qualifier_counting_climbs,
    finals_cutoff,
    finals_tie_advances,
    finals_eligible_age_groups
  )
  values
    (
      gen_random_uuid(),
      'test-rec-scramble',
      'Test Recreational Scramble',
      'active',
      'scramble',
      'Boulder',
      'qualifier',
      'Halifax',
      current_date,
      current_date,
      now(),
      now() + interval '6 hours',
      'Public self-scoring scramble.',
      20,
      60,
      6,
      6,
      true,
      '["Open"]'::jsonb
    ),
    (
      gen_random_uuid(),
      'test-youth-finals',
      'Test Youth Competitive',
      'active',
      'five_on_five_off',
      'Boulder',
      'qualifier',
      'Halifax',
      current_date,
      current_date,
      now(),
      now() + interval '10 hours',
      'Competitive event with finals active.',
      20,
      120,
      6,
      8,
      true,
      '["Youth D","Youth B","Youth A","Junior"]'::jsonb
    )
  returning id, slug, name, max_climbers
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
  division || '::' || age_group,
  inserted_competitions.id,
  division,
  age_group,
  division || ' / ' || age_group,
  row_number() over (partition by inserted_competitions.id order by division, age_group) - 1
from inserted_competitions
cross join (values ('Men'), ('Women'), ('X')) as divisions(division)
cross join (values ('Youth D'), ('Youth C'), ('Youth B'), ('Youth A'), ('Junior'), ('Rec'), ('Masters'), ('Open')) as ages(age_group);

insert into public.competition_schedule_blocks (
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
  case slug when 'test-rec-scramble' then 'Scramble live' else 'Youth qualifiers live' end,
  'qualifier_round',
  name,
  true,
  '09:00',
  '12:00',
  max_climbers,
  '[]'::jsonb
from public.competitions;

with competition_map as (
  select id, slug from public.competitions
),
athletes as (
  select
    series.n as athlete_number,
    case when series.n <= 40 then 'test-rec-scramble' else 'test-youth-finals' end as competition_slug,
    case ((series.n * 7) % 15)
      when 0 then 'Alex' when 1 then 'Jordan' when 2 then 'Taylor'
      when 3 then 'Morgan' when 4 then 'Riley' when 5 then 'Casey'
      when 6 then 'Skyler' when 7 then 'Avery' when 8 then 'Quinn'
      when 9 then 'Parker' when 10 then 'Jamie' when 11 then 'Drew'
      when 12 then 'Reese' when 13 then 'Cameron' else 'Blake'
    end || ' ' ||
    case ((series.n * 11) % 10)
      when 0 then 'Stone' when 1 then 'Reid' when 2 then 'Cruz'
      when 3 then 'Chen' when 4 then 'Roy' when 5 then 'Sato'
      when 6 then 'Lopez' when 7 then 'Singh' when 8 then 'Bennett'
      else 'Nguyen'
    end || ' ' || series.n as athlete_name,
    case ((series.n * 13) % 13)
      when 0 then 'AB' when 1 then 'BC' when 2 then 'MB'
      when 3 then 'NB' when 4 then 'NL' when 5 then 'NS'
      when 6 then 'NT' when 7 then 'NU' when 8 then 'ON'
      when 9 then 'PE' when 10 then 'QC' when 11 then 'SK' else 'YT'
    end as province,
    case when series.n <= 40 then 'Rec' else
      (array['Youth D','Youth C','Youth B','Youth A','Junior'])[((series.n % 5) + 1)]
    end as age_group,
    case when (series.n % 2) = 0 then 'Men' else 'Women' end as gender_division
  from generate_series(1, 100) as series(n)
),
inserted_climbers as (
  insert into public.climbers (
    competition_id,
    name,
    climber_number,
    province,
    category_id,
    gender_division,
    age_group,
    display_category,
    access_token
  )
  select
    competition_map.id,
    athletes.athlete_name,
    lpad(athletes.athlete_number::text, 3, '0'),
    athletes.province,
    athletes.gender_division || '::' || athletes.age_group,
    athletes.gender_division,
    athletes.age_group,
    athletes.gender_division || ' / ' || athletes.age_group,
    'test-link-' || lpad(athletes.athlete_number::text, 3, '0')
  from athletes
  join competition_map on competition_map.slug = athletes.competition_slug
  returning id, competition_id, climber_number
)
insert into public.qualifier_attempts (
  competition_id,
  climber_id,
  climb_number,
  attempt_count,
  topped,
  entered_by
)
select
  inserted_climbers.competition_id,
  inserted_climbers.id,
  climbs.climb_number,
  1 + ((inserted_climbers.climber_number::int * climbs.climb_number) % 4),
  ((inserted_climbers.climber_number::int + climbs.climb_number) % 3) <> 0,
  case when climbs.climb_number <= 8 then 'climber' else 'staff' end
from inserted_climbers
cross join generate_series(1, 20) as climbs(climb_number)
where climbs.climb_number <= 5 + ((inserted_climbers.climber_number::int * 3) % 16);

delete from public.final_attempts
where competition_id = (select id from public.competitions where slug = 'test-youth-finals');

delete from public.competition_finalists
where competition_id = (select id from public.competitions where slug = 'test-youth-finals');

with target as (
  select *
  from public.competitions
  where slug = 'test-youth-finals'
),
climber_scores as (
  select
    c.id as climber_id,
    c.name,
    c.category_id,
    c.display_category,
    c.gender_division,
    c.age_group,
    q.climb_number,
    q.attempt_count,
    q.topped,
    case
      when q.topped
        then greatest(0, q.climb_number * 1000 - least(greatest(q.attempt_count - 1, 0), 3) * 200)
      else 0
    end as score
  from public.climbers c
  join target on target.id = c.competition_id
  left join public.qualifier_attempts q on q.climber_id = c.id
),
counting_scores as (
  select *
  from (
    select
      climber_scores.*,
      row_number() over (
        partition by climber_id
        order by score desc, climb_number desc, attempt_count asc
      ) as score_row
    from climber_scores
    where score > 0
  ) ranked_scores
  where score_row <= (select qualifier_counting_climbs from target)
),
qualifier_totals as (
  select
    c.id as climber_id,
    c.name,
    c.category_id,
    c.display_category,
    c.gender_division,
    c.age_group,
    coalesce(sum(cs.score), 0) as total_score,
    coalesce(count(*) filter (where cs.topped), 0) as topped_count,
    coalesce(sum(cs.attempt_count), 0) as counting_attempt_total
  from public.climbers c
  join target on target.id = c.competition_id
  left join counting_scores cs on cs.climber_id = c.id
  group by c.id, c.name, c.category_id, c.display_category, c.gender_division, c.age_group
),
ranked as (
  select
    qualifier_totals.*,
    row_number() over (
      partition by category_id
      order by total_score desc, topped_count desc, counting_attempt_total asc, name asc
    ) as category_rank
  from qualifier_totals
  where gender_division in ('Men', 'Women')
    and age_group in (
      select jsonb_array_elements_text((select finals_eligible_age_groups from target))
    )
),
cutoff as (
  select
    category_id,
    total_score,
    topped_count,
    counting_attempt_total
  from ranked
  where category_rank = (select finals_cutoff from target)
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
  advanced_with_tie
)
select
  target.id,
  ranked.climber_id,
  ranked.name,
  ranked.category_id,
  ranked.display_category,
  ranked.gender_division,
  ranked.age_group,
  ranked.category_rank,
  ranked.category_rank > target.finals_cutoff
from ranked
cross join target
left join cutoff using (category_id)
where ranked.category_rank <= target.finals_cutoff
   or (
     target.finals_tie_advances
     and cutoff.category_id is not null
     and ranked.category_rank > target.finals_cutoff
     and ranked.total_score = cutoff.total_score
     and ranked.topped_count = cutoff.topped_count
     and ranked.counting_attempt_total = cutoff.counting_attempt_total
   );

update public.competitions
set
  format = 'ifsc_finals_format',
  stage_mode = 'finals',
  qualifier_locked_at = now(),
  finals_started_at = now(),
  finals_problem_count = 4
where slug = 'test-youth-finals';

update public.competition_schedule_blocks
set
  label = 'Finals live',
  phase_type = 'finals_round'
where competition_id = (select id from public.competitions where slug = 'test-youth-finals');

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
cross join generate_series(1, 4) as climbs(climb_number);

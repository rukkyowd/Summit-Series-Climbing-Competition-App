begin;

do $$
begin
  if not exists (
    select 1 from public.competitions where slug = 'mock-youth-series-live'
  ) then
    raise exception 'Run sql/mock-events-seed.sql first.';
  end if;
end $$;

with comp as (
  select
    c.id as competition_id,
    c.finals_cutoff,
    cr.id as round_id,
    cr.problem_count
  from public.competitions c
  join public.competition_rounds cr
    on cr.competition_id = c.id
   and cr.round_type = 'qualifier'
  where c.slug = 'mock-youth-series-live'
  limit 1
),
target_athletes as (
  select
    cl.id as climber_id,
    cl.name,
    cl.category_id,
    cl.climber_number,
    comp.competition_id,
    comp.round_id,
    comp.problem_count,
    comp.finals_cutoff,
    row_number() over (
      partition by cl.category_id
      order by cl.climber_number
    ) as cat_seq
  from public.climbers cl
  join comp on comp.competition_id = cl.competition_id
  where cl.gender_division = 'Men'
    and cl.age_group in ('Youth B', 'Youth A', 'Junior', 'Open')
  order by cl.category_id, cl.climber_number
),
drama_trio as (
  select
    climber_id,
    name,
    category_id,
    competition_id,
    round_id,
    problem_count,
    finals_cutoff,
    cat_seq,
    case cat_seq
      when 1 then 'athlete_a'
      when 2 then 'athlete_b'
      when 3 then 'athlete_c'
    end as role
  from target_athletes
  where cat_seq <= 3
    and category_id = (
      select cl2.category_id
      from public.climbers cl2
      join comp on comp.competition_id = cl2.competition_id
      where cl2.gender_division = 'Men'
        and cl2.age_group in ('Youth B', 'Youth A', 'Junior', 'Open')
      group by cl2.category_id
      order by count(*) desc
      limit 1
    )
),
drama_climber_ids as (
  select climber_id, role from drama_trio
)
delete from public.qualifier_attempts qa
using drama_climber_ids dci
where qa.climber_id = dci.climber_id;

insert into public.qualifier_attempts (
  competition_id, round_id, climber_id,
  climb_number, attempt_count,
  zone, topped,
  attempts_to_top, attempts_to_zone,
  entered_by
)
select
  dt.competition_id,
  dt.round_id,
  dt.climber_id,
  attempt_data.climb_number,
  attempt_data.attempt_count,
  attempt_data.zone,
  attempt_data.topped,
  attempt_data.attempts_to_top,
  attempt_data.attempts_to_zone,
  'staff'
from drama_trio dt
cross join (
  values
    (1, 1, true, true, 1, 1),
    (2, 1, true, true, 1, 1),
    (3, 1, true, true, 1, 1),
    (4, 2, true, false, null, 2)
) as attempt_data(climb_number, attempt_count, zone, topped, attempts_to_top, attempts_to_zone)
where dt.role = 'athlete_a';

insert into public.qualifier_attempts (
  competition_id, round_id, climber_id,
  climb_number, attempt_count,
  zone, topped,
  attempts_to_top, attempts_to_zone,
  entered_by
)
select
  dt.competition_id,
  dt.round_id,
  dt.climber_id,
  attempt_data.climb_number,
  attempt_data.attempt_count,
  attempt_data.zone,
  attempt_data.topped,
  attempt_data.attempts_to_top,
  attempt_data.attempts_to_zone,
  'staff'
from drama_trio dt
cross join (
  values
    (1, 1, true, true, 1, 1),
    (2, 2, true, true, 2, 1),
    (3, 2, true, true, 2, 1),
    (4, 1, true, false, null, 1)
) as attempt_data(climb_number, attempt_count, zone, topped, attempts_to_top, attempts_to_zone)
where dt.role = 'athlete_b';

insert into public.qualifier_attempts (
  competition_id, round_id, climber_id,
  climb_number, attempt_count,
  zone, topped,
  attempts_to_top, attempts_to_zone,
  entered_by
)
select
  dt.competition_id,
  dt.round_id,
  dt.climber_id,
  attempt_data.climb_number,
  attempt_data.attempt_count,
  attempt_data.zone,
  attempt_data.topped,
  attempt_data.attempts_to_top,
  attempt_data.attempts_to_zone,
  'staff'
from drama_trio dt
cross join (
  values
    (1, 1, true, true, 1, 1),
    (2, 2, true, true, 2, 1),
    (3, 3, true, true, 3, 2),
    (4, 1, true, false, null, 1)
) as attempt_data(climb_number, attempt_count, zone, topped, attempts_to_top, attempts_to_zone)
where dt.role = 'athlete_c';

do $$
declare
  v_comp_id uuid;
  v_athlete_b uuid;
  v_athlete_c uuid;
begin
  select id into v_comp_id
  from public.competitions
  where slug = 'mock-youth-series-live'
  limit 1;

  select dt.climber_id into v_athlete_b
  from (
    select
      cl.id as climber_id,
      row_number() over (partition by cl.category_id order by cl.climber_number) as cat_seq
    from public.climbers cl
    where cl.competition_id = v_comp_id
      and cl.gender_division = 'Men'
      and cl.age_group in ('Youth B', 'Youth A', 'Junior', 'Open')
      and cl.category_id = (
        select cl2.category_id
        from public.climbers cl2
        where cl2.competition_id = v_comp_id
          and cl2.gender_division = 'Men'
          and cl2.age_group in ('Youth B', 'Youth A', 'Junior', 'Open')
        group by cl2.category_id
        order by count(*) desc
        limit 1
      )
  ) dt
  where dt.cat_seq = 2;

  select dt.climber_id into v_athlete_c
  from (
    select
      cl.id as climber_id,
      row_number() over (partition by cl.category_id order by cl.climber_number) as cat_seq
    from public.climbers cl
    where cl.competition_id = v_comp_id
      and cl.gender_division = 'Men'
      and cl.age_group in ('Youth B', 'Youth A', 'Junior', 'Open')
      and cl.category_id = (
        select cl2.category_id
        from public.climbers cl2
        where cl2.competition_id = v_comp_id
          and cl2.gender_division = 'Men'
          and cl2.age_group in ('Youth B', 'Youth A', 'Junior', 'Open')
        group by cl2.category_id
        order by count(*) desc
        limit 1
      )
  ) dt
  where dt.cat_seq = 3;

  alter table public.competitions
  add column if not exists demo_metadata jsonb not null default '{}'::jsonb;

  update public.competitions
  set demo_metadata = jsonb_build_object(
    'drama_pair', jsonb_build_array(v_athlete_b::text, v_athlete_c::text),
    'drama_target_climber', v_athlete_c::text,
    'drama_target_climb_number', 3,
    'drama_target_attempts_before', 3,
    'drama_target_attempts_after', 1,
    'drama_description',
      'Athlete C tops B3 in 1 attempt instead of 3 and leapfrogs Athlete B at the cut line on attempts'
  )
  where id = v_comp_id;
end $$;

commit;

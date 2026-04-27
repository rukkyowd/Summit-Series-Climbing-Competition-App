alter table public.qualifier_attempts
add column if not exists round_id uuid references public.competition_rounds(id) on delete cascade;

alter table public.final_attempts
add column if not exists round_id uuid references public.competition_rounds(id) on delete cascade;

update public.qualifier_attempts qa
set round_id = (
  select cr.id
  from public.competition_rounds cr
  where cr.competition_id = qa.competition_id
    and cr.scoring_bucket = 'qualifier'
  order by cr.sort_order, cr.round_number, cr.created_at
  limit 1
)
where qa.round_id is null;

update public.final_attempts fa
set round_id = (
  select cr.id
  from public.competition_rounds cr
  where cr.competition_id = fa.competition_id
    and cr.scoring_bucket = 'finals'
  order by cr.sort_order, cr.round_number, cr.created_at
  limit 1
)
where fa.round_id is null;

alter table public.qualifier_attempts
alter column round_id set not null;

alter table public.final_attempts
alter column round_id set not null;

alter table public.qualifier_attempts
drop constraint if exists qualifier_attempts_climber_id_climb_number_key;

alter table public.final_attempts
drop constraint if exists final_attempts_climber_id_climb_number_key;

create unique index if not exists qualifier_attempts_round_climb_key
on public.qualifier_attempts (competition_id, round_id, climber_id, climb_number);

create unique index if not exists final_attempts_round_climb_key
on public.final_attempts (competition_id, round_id, climber_id, climb_number);

create index if not exists qualifier_attempts_round_idx
on public.qualifier_attempts (competition_id, round_id, climber_id, climb_number);

create index if not exists final_attempts_round_idx
on public.final_attempts (competition_id, round_id, climber_id, climb_number);

drop index if exists public.competition_rounds_one_qualifier_bucket_idx;

alter table public.competition_rounds
drop constraint if exists competition_rounds_scoring_bucket_type_check;

alter table public.competition_rounds
add constraint competition_rounds_scoring_bucket_type_check
check (
  (round_type in ('qualifier', 'semifinal') and scoring_bucket in ('none', 'qualifier'))
  or (round_type = 'finals' and scoring_bucket in ('none', 'finals'))
);

create or replace function public.resolve_competition_scoring_round_id(
  p_competition_id uuid,
  p_bucket text,
  p_requested_round_id uuid default null
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with candidate_rounds as (
    select
      cr.id,
      cr.sort_order,
      cr.round_number,
      cr.is_active,
      exists (
        select 1
        from public.competition_schedule_blocks csb
        where csb.competition_id = p_competition_id
          and csb.round_id = cr.id
          and csb.is_active = true
      ) as block_is_active
    from public.competition_rounds cr
    where cr.competition_id = p_competition_id
      and cr.scoring_bucket = p_bucket
      and cr.is_enabled = true
  )
  select coalesce(
    (select id from candidate_rounds where id = p_requested_round_id limit 1),
    (select id from candidate_rounds where block_is_active order by sort_order, round_number limit 1),
    (select id from candidate_rounds where is_active order by sort_order, round_number limit 1),
    (select id from candidate_rounds order by sort_order, round_number limit 1)
  );
$$;

drop function if exists public.compute_qualifier_standings(uuid);

create or replace function public.compute_qualifier_standings(
  p_competition_id uuid,
  p_round_id uuid default null
)
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
  resolved_round as (
    select cr.*
    from public.competition_rounds cr
    where cr.id = public.resolve_competition_scoring_round_id(p_competition_id, 'qualifier', p_round_id)
    limit 1
  ),
  round_config as (
    select
      coalesce((select id from resolved_round), p_round_id) as round_id,
      coalesce((select format from resolved_round), (select format from competition_row)) as format,
      greatest(coalesce((select problem_count from resolved_round), (select total_climbs from competition_row), 1), 1) as total_climbs,
      greatest(coalesce((select counting_climbs from resolved_round), (select qualifier_counting_climbs from competition_row), 1), 1) as counting_climbs
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
        when (select format from round_config) in ('flash_format', 'five_on_five_off', 'ifsc_finals_format') then
          case
            when coalesce(qa.topped, false) then greatest(coalesce(qa.attempts_to_top, qa.attempt_count, 1), 1)
            when coalesce(qa.zone, qa.topped, false) then greatest(coalesce(qa.attempts_to_zone, qa.attempts_to_top, qa.attempt_count, 1), 1)
            else 0
          end
        else coalesce(qa.attempt_count, 0)
      end as scoring_attempt_count,
      case
        when (select format from round_config) in ('flash_format', 'five_on_five_off', 'ifsc_finals_format') then
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
    cross join generate_series(1, (select total_climbs from round_config)) as gs(climb_number)
    left join public.qualifier_attempts qa
      on qa.competition_id = p_competition_id
     and qa.climber_id = c.id
     and qa.round_id = (select round_id from round_config)
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
        when (select format from round_config) in ('flash_format', 'five_on_five_off', 'ifsc_finals_format') then true
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
        when (select format from round_config) in ('flash_format', 'five_on_five_off', 'ifsc_finals_format')
          then (select total_climbs from round_config)
        else (select counting_climbs from round_config)
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

drop function if exists public.compute_finalist_selection(uuid);

create or replace function public.compute_finalist_selection(
  p_competition_id uuid,
  p_source_round_id uuid default null,
  p_cutoff_override integer default null
)
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
  cutoff_value as (
    select greatest(coalesce(p_cutoff_override, (select finals_cutoff from competition_row), 1), 1) as value
  ),
  ranked as (
    select *
    from public.compute_qualifier_standings(
      p_competition_id,
      coalesce(p_source_round_id, public.resolve_competition_scoring_round_id(p_competition_id, 'qualifier', null))
    )
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
    where category_rank = (select value from cutoff_value)
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
      ranked.category_rank > (select value from cutoff_value) as advanced_with_tie
    from ranked
    left join cutoff using (category_id)
    where ranked.category_rank <= (select value from cutoff_value)
       or (
         (select finals_tie_advances from competition_row)
         and cutoff.category_id is not null
         and ranked.category_rank > (select value from cutoff_value)
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

drop function if exists public.submit_qualifier_attempt(text, uuid, integer, integer, boolean);

create or replace function public.submit_qualifier_attempt(
  p_access_token text,
  p_competition_id uuid,
  p_climb_number integer,
  p_attempt_count integer,
  p_topped boolean,
  p_round_id uuid default null
)
returns public.qualifier_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_climber public.climbers;
  v_attempt public.qualifier_attempts;
  v_round_id uuid;
begin
  if not public.qualifier_self_scoring_open_for_competition(p_competition_id) then
    raise exception 'Qualifier self-scoring is not open for this competition';
  end if;

  select *
  into v_climber
  from public.climbers
  where access_token = trim(p_access_token)
    and competition_id = p_competition_id
  limit 1;

  if v_climber.id is null then
    raise exception 'Private qualifier link not recognized';
  end if;

  v_round_id := public.resolve_competition_scoring_round_id(p_competition_id, 'qualifier', p_round_id);

  if v_round_id is null then
    raise exception 'No active qualifier-style round is configured for self-scoring';
  end if;

  insert into public.qualifier_attempts (
    competition_id,
    round_id,
    climber_id,
    climb_number,
    attempt_count,
    zone,
    topped,
    attempts_to_top,
    attempts_to_zone,
    entered_by
  )
  values (
    p_competition_id,
    v_round_id,
    v_climber.id,
    p_climb_number,
    greatest(p_attempt_count, 0),
    p_topped,
    p_topped,
    case when p_topped then greatest(p_attempt_count, 1) else null end,
    case when p_topped then greatest(p_attempt_count, 1) else null end,
    'climber'
  )
  on conflict (competition_id, round_id, climber_id, climb_number) do update
  set
    attempt_count = excluded.attempt_count,
    zone = excluded.zone,
    topped = excluded.topped,
    attempts_to_top = excluded.attempts_to_top,
    attempts_to_zone = excluded.attempts_to_zone,
    entered_by = 'climber',
    updated_at = now()
  returning *
  into v_attempt;

  return v_attempt;
end;
$$;

create or replace function public.advance_competition_to_finals(p_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competition public.competitions;
  v_finals_round public.competition_rounds;
  v_source_round_id uuid;
  v_cutoff integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can advance a competition to finals';
  end if;

  select *
  into v_competition
  from public.competitions
  where id = p_competition_id
  for update;

  if v_competition.id is null then
    raise exception 'Competition not found';
  end if;

  if v_competition.stage_mode <> 'qualifier' then
    raise exception 'Competition is not in qualifiers';
  end if;

  perform public.save_competition_operation(p_competition_id, 'advance');

  select *
  into v_finals_round
  from public.competition_rounds
  where id = public.resolve_competition_scoring_round_id(p_competition_id, 'finals', null);

  v_source_round_id := coalesce(
    v_finals_round.advancement_source_round_id,
    public.resolve_competition_scoring_round_id(p_competition_id, 'qualifier', null)
  );
  v_cutoff := coalesce(v_finals_round.advancement_cutoff, v_finals_round.finals_cutoff, v_competition.finals_cutoff);

  delete from public.final_attempts where competition_id = p_competition_id;
  delete from public.competition_finalists where competition_id = p_competition_id;

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
  select
    p_competition_id,
    climber_id,
    name,
    category_id,
    display_category,
    gender_division,
    age_group,
    qualifier_rank,
    advanced_with_tie,
    climbing_order
  from public.compute_finalist_selection(p_competition_id, v_source_round_id, v_cutoff);

  update public.competitions
  set
    current_phase = 'finals_open',
    stage_mode = public.phase_to_stage_mode('finals_open'),
    qualifier_locked_at = coalesce(qualifier_locked_at, now()),
    finals_started_at = coalesce(finals_started_at, now())
  where id = p_competition_id;

  perform public.log_competition_phase_change(p_competition_id, v_competition.current_phase, 'finals_open', 'Advanced to finals');
end;
$$;

create or replace function public.build_competition_snapshot_json(p_competition_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'competition', (
      select to_jsonb(c)
      from public.competitions c
      where c.id = p_competition_id
    ),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(cc) order by cc.sort_order, cc.display_name)
      from public.competition_categories cc
      where cc.competition_id = p_competition_id
    ), '[]'::jsonb),
    'schedule_blocks', coalesce((
      select jsonb_agg(to_jsonb(sb) order by sb.start_time, sb.label)
      from public.competition_schedule_blocks sb
      where sb.competition_id = p_competition_id
    ), '[]'::jsonb),
    'climbers', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.registered_at, c.name)
      from public.climbers c
      where c.competition_id = p_competition_id
    ), '[]'::jsonb),
    'qualifier_attempts', coalesce((
      select jsonb_agg(to_jsonb(qa) order by qa.round_id, qa.climber_id, qa.climb_number)
      from public.qualifier_attempts qa
      where qa.competition_id = p_competition_id
    ), '[]'::jsonb),
    'finalists', coalesce((
      select jsonb_agg(to_jsonb(cf) order by cf.display_category, cf.climbing_order, cf.qualifier_rank, cf.name)
      from public.competition_finalists cf
      where cf.competition_id = p_competition_id
    ), '[]'::jsonb),
    'final_attempts', coalesce((
      select jsonb_agg(to_jsonb(fa) order by fa.round_id, fa.climber_id, fa.climb_number)
      from public.final_attempts fa
      where fa.competition_id = p_competition_id
    ), '[]'::jsonb),
    'rounds', coalesce((
      select jsonb_agg(to_jsonb(cr) order by cr.sort_order, cr.round_number)
      from public.competition_rounds cr
      where cr.competition_id = p_competition_id
    ), '[]'::jsonb)
  );
$$;

create or replace function public.restore_competition_snapshot(
  p_competition_id uuid,
  p_snapshot jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competition jsonb;
begin
  v_competition := p_snapshot -> 'competition';

  if v_competition is null or v_competition = 'null'::jsonb then
    raise exception 'Competition snapshot missing competition row';
  end if;

  delete from public.final_attempts where competition_id = p_competition_id;
  delete from public.competition_finalists where competition_id = p_competition_id;
  delete from public.qualifier_attempts where competition_id = p_competition_id;
  delete from public.climbers where competition_id = p_competition_id;
  delete from public.competition_schedule_blocks where competition_id = p_competition_id;
  delete from public.competition_categories where competition_id = p_competition_id;
  delete from public.competition_rounds where competition_id = p_competition_id;

  update public.competitions
  set
    slug = v_competition ->> 'slug',
    name = v_competition ->> 'name',
    status = v_competition ->> 'status',
    format = v_competition ->> 'format',
    current_phase = v_competition ->> 'current_phase',
    discipline_label = v_competition ->> 'discipline_label',
    stage_mode = v_competition ->> 'stage_mode',
    location_name = coalesce(v_competition ->> 'location_name', ''),
    start_date = nullif(v_competition ->> 'start_date', '')::date,
    end_date = nullif(v_competition ->> 'end_date', '')::date,
    registration_opens_at = nullif(v_competition ->> 'registration_opens_at', '')::timestamptz,
    registration_closes_at = nullif(v_competition ->> 'registration_closes_at', '')::timestamptz,
    description = coalesce(v_competition ->> 'description', ''),
    hero_image_url = coalesce(v_competition ->> 'hero_image_url', ''),
    total_climbs = coalesce((v_competition ->> 'total_climbs')::integer, 30),
    max_climbers = coalesce((v_competition ->> 'max_climbers')::integer, 80),
    qualifier_counting_climbs = coalesce((v_competition ->> 'qualifier_counting_climbs')::integer, 6),
    finals_cutoff = coalesce((v_competition ->> 'finals_cutoff')::integer, 6),
    finals_tie_advances = coalesce((v_competition ->> 'finals_tie_advances')::boolean, true),
    qualifier_eligible_age_groups = coalesce(v_competition -> 'qualifier_eligible_age_groups', '[]'::jsonb),
    finals_eligible_age_groups = coalesce(v_competition -> 'finals_eligible_age_groups', '[]'::jsonb),
    qualifier_locked_at = nullif(v_competition ->> 'qualifier_locked_at', '')::timestamptz,
    finals_started_at = nullif(v_competition ->> 'finals_started_at', '')::timestamptz,
    finals_problem_count = coalesce((v_competition ->> 'finals_problem_count')::integer, 4)
  where id = p_competition_id;

  insert into public.competition_categories (
    id,
    competition_id,
    gender_division,
    age_group,
    display_name,
    sort_order,
    created_at
  )
  select
    category ->> 'id',
    p_competition_id,
    category ->> 'gender_division',
    category ->> 'age_group',
    category ->> 'display_name',
    coalesce((category ->> 'sort_order')::integer, 0),
    coalesce(nullif(category ->> 'created_at', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_snapshot -> 'categories', '[]'::jsonb)) category;

  insert into public.competition_rounds (
    id,
    competition_id,
    round_number,
    sort_order,
    name,
    round_type,
    format,
    status,
    runtime_phase,
    is_enabled,
    is_active,
    activated_at,
    problem_count,
    counting_climbs,
    finals_cutoff,
    eligible_category_ids,
    advancement_source_round_id,
    advancement_cutoff,
    scoring_bucket,
    scoring_config,
    started_at,
    closed_at,
    created_at
  )
  select
    (round_entry ->> 'id')::uuid,
    p_competition_id,
    coalesce((round_entry ->> 'round_number')::integer, 1),
    coalesce((round_entry ->> 'sort_order')::integer, coalesce((round_entry ->> 'round_number')::integer, 1)),
    round_entry ->> 'name',
    round_entry ->> 'round_type',
    round_entry ->> 'format',
    coalesce(round_entry ->> 'status', 'pending'),
    coalesce(round_entry ->> 'runtime_phase', 'qualifier_open'),
    coalesce((round_entry ->> 'is_enabled')::boolean, true),
    coalesce((round_entry ->> 'is_active')::boolean, false),
    nullif(round_entry ->> 'activated_at', '')::timestamptz,
    coalesce((round_entry ->> 'problem_count')::integer, 4),
    nullif(round_entry ->> 'counting_climbs', '')::integer,
    nullif(round_entry ->> 'finals_cutoff', '')::integer,
    coalesce(array(select jsonb_array_elements_text(coalesce(round_entry -> 'eligible_category_ids', '[]'::jsonb))), '{}'::text[]),
    nullif(round_entry ->> 'advancement_source_round_id', '')::uuid,
    nullif(round_entry ->> 'advancement_cutoff', '')::integer,
    coalesce(round_entry ->> 'scoring_bucket', 'none'),
    coalesce(round_entry -> 'scoring_config', '{}'::jsonb),
    nullif(round_entry ->> 'started_at', '')::timestamptz,
    nullif(round_entry ->> 'closed_at', '')::timestamptz,
    coalesce(nullif(round_entry ->> 'created_at', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_snapshot -> 'rounds', '[]'::jsonb)) round_entry;

  insert into public.competition_schedule_blocks (
    id,
    competition_id,
    round_id,
    label,
    phase_type,
    audience_label,
    is_active,
    start_time,
    end_time,
    capacity,
    eligible_category_ids,
    created_at
  )
  select
    (block ->> 'id')::uuid,
    p_competition_id,
    nullif(block ->> 'round_id', '')::uuid,
    block ->> 'label',
    block ->> 'phase_type',
    coalesce(block ->> 'audience_label', ''),
    coalesce((block ->> 'is_active')::boolean, false),
    nullif(block ->> 'start_time', ''),
    nullif(block ->> 'end_time', ''),
    coalesce((block ->> 'capacity')::integer, 20),
    coalesce(block -> 'eligible_category_ids', '[]'::jsonb),
    coalesce(nullif(block ->> 'created_at', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_snapshot -> 'schedule_blocks', '[]'::jsonb)) block;

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
    (climber ->> 'id')::uuid,
    p_competition_id,
    climber ->> 'name',
    climber ->> 'climber_number',
    climber ->> 'province',
    nullif(climber ->> 'category_id', ''),
    climber ->> 'gender_division',
    climber ->> 'age_group',
    climber ->> 'display_category',
    nullif(climber ->> 'time_slot_id', '')::uuid,
    climber ->> 'access_token',
    coalesce(nullif(climber ->> 'access_token_created_at', '')::timestamptz, now()),
    coalesce(nullif(climber ->> 'registered_at', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_snapshot -> 'climbers', '[]'::jsonb)) climber;

  insert into public.qualifier_attempts (
    id,
    competition_id,
    round_id,
    climber_id,
    climb_number,
    attempt_count,
    zone,
    topped,
    attempts_to_top,
    attempts_to_zone,
    entered_by,
    updated_at
  )
  select
    (attempt ->> 'id')::uuid,
    p_competition_id,
    nullif(attempt ->> 'round_id', '')::uuid,
    (attempt ->> 'climber_id')::uuid,
    coalesce((attempt ->> 'climb_number')::integer, 1),
    coalesce((attempt ->> 'attempt_count')::integer, 0),
    coalesce((attempt ->> 'zone')::boolean, false),
    coalesce((attempt ->> 'topped')::boolean, false),
    nullif(attempt ->> 'attempts_to_top', '')::integer,
    nullif(attempt ->> 'attempts_to_zone', '')::integer,
    coalesce(attempt ->> 'entered_by', 'climber'),
    coalesce(nullif(attempt ->> 'updated_at', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_snapshot -> 'qualifier_attempts', '[]'::jsonb)) attempt;

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
    created_at,
    climbing_order
  )
  select
    p_competition_id,
    (finalist ->> 'climber_id')::uuid,
    finalist ->> 'name',
    nullif(finalist ->> 'category_id', ''),
    finalist ->> 'display_category',
    finalist ->> 'gender_division',
    finalist ->> 'age_group',
    coalesce((finalist ->> 'qualifier_rank')::integer, 0),
    coalesce((finalist ->> 'advanced_with_tie')::boolean, false),
    coalesce(nullif(finalist ->> 'created_at', '')::timestamptz, now()),
    coalesce((finalist ->> 'climbing_order')::integer, coalesce((finalist ->> 'qualifier_rank')::integer, 0))
  from jsonb_array_elements(coalesce(p_snapshot -> 'finalists', '[]'::jsonb)) finalist;

  insert into public.final_attempts (
    id,
    competition_id,
    round_id,
    climber_id,
    climb_number,
    top,
    zone,
    attempts_to_top,
    attempts_to_zone,
    entered_by,
    updated_at
  )
  select
    (attempt ->> 'id')::uuid,
    p_competition_id,
    nullif(attempt ->> 'round_id', '')::uuid,
    (attempt ->> 'climber_id')::uuid,
    coalesce((attempt ->> 'climb_number')::integer, 1),
    coalesce((attempt ->> 'top')::boolean, false),
    coalesce((attempt ->> 'zone')::boolean, false),
    nullif(attempt ->> 'attempts_to_top', '')::integer,
    nullif(attempt ->> 'attempts_to_zone', '')::integer,
    coalesce(attempt ->> 'entered_by', 'staff'),
    coalesce(nullif(attempt ->> 'updated_at', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_snapshot -> 'final_attempts', '[]'::jsonb)) attempt;
end;
$$;

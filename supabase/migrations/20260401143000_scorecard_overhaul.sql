alter table public.competitions
add column if not exists current_phase text;

update public.competitions
set current_phase = case
  when stage_mode = 'finals' then 'finals_open'
  else 'qualifier_open'
end
where current_phase is null;

alter table public.competitions
alter column current_phase set default 'qualifier_open';

alter table public.competitions
alter column current_phase set not null;

alter table public.competitions
drop constraint if exists competitions_current_phase_check;

alter table public.competitions
add constraint competitions_current_phase_check
check (current_phase in ('qualifier_open', 'qualifier_closed', 'wall_reset', 'observation', 'finals_open', 'finals_closed', 'results'));

alter table public.competitions
drop constraint if exists competitions_finals_problem_count_check;

alter table public.competitions
add constraint competitions_finals_problem_count_check
check (finals_problem_count between 1 and 8);

alter table public.final_attempts
drop constraint if exists final_attempts_climb_number_check;

alter table public.final_attempts
add constraint final_attempts_climb_number_check
check (climb_number between 1 and 8);

create table if not exists public.competition_phase_log (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  from_phase text,
  to_phase text not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  note text,
  check (from_phase is null or from_phase in ('qualifier_open', 'qualifier_closed', 'wall_reset', 'observation', 'finals_open', 'finals_closed', 'results')),
  check (to_phase in ('qualifier_open', 'qualifier_closed', 'wall_reset', 'observation', 'finals_open', 'finals_closed', 'results'))
);

create table if not exists public.competition_operations (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  operation_type text not null check (operation_type in ('advance', 'reset')),
  snapshot jsonb not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

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
);

alter table public.competition_finalists
add column if not exists climbing_order integer;

update public.competition_finalists
set climbing_order = qualifier_rank
where climbing_order is null;

alter table public.competition_finalists
alter column climbing_order set default 0;

create index if not exists climbers_access_token_idx
on public.climbers (access_token);

create index if not exists qualifier_attempts_topped_idx
on public.qualifier_attempts (competition_id, climber_id, topped, climb_number desc);

create index if not exists competition_phase_log_competition_idx
on public.competition_phase_log (competition_id, changed_at desc);

create index if not exists competition_operations_competition_idx
on public.competition_operations (competition_id, created_at desc);

create index if not exists competition_rounds_competition_idx
on public.competition_rounds (competition_id, round_number, status);

create index if not exists competition_finalists_climbing_order_idx
on public.competition_finalists (competition_id, display_category, climbing_order);

create or replace function public.phase_to_stage_mode(p_phase text)
returns text
language sql
immutable
as $$
  select case
    when p_phase in ('observation', 'finals_open', 'finals_closed', 'results') then 'finals'
    else 'qualifier'
  end
$$;

create or replace function public.log_competition_phase_change(
  p_competition_id uuid,
  p_from_phase text,
  p_to_phase text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.competition_phase_log (competition_id, from_phase, to_phase, changed_by, note)
  values (p_competition_id, p_from_phase, p_to_phase, auth.uid(), p_note);
end;
$$;

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

create or replace function public.registration_open_for_competition(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select current_phase = 'qualifier_open'
    from public.competitions
    where id = p_competition_id
  ), false)
$$;

create or replace function public.qualifier_staff_scoring_open_for_competition(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select current_phase = 'qualifier_open'
    from public.competitions
    where id = p_competition_id
  ), false)
$$;

create or replace function public.qualifier_self_scoring_open_for_competition(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select current_phase = 'qualifier_open' and format = 'scramble'
    from public.competitions
    where id = p_competition_id
  ), false)
$$;

create or replace function public.finals_staff_scoring_open_for_competition(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select current_phase = 'finals_open'
    from public.competitions
    where id = p_competition_id
  ), false)
$$;

create or replace function public.set_competition_phase(
  p_competition_id uuid,
  p_next_phase text,
  p_note text default null
)
returns public.competitions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competition public.competitions;
  v_previous_phase text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change competition phases';
  end if;

  if p_next_phase not in ('qualifier_open', 'qualifier_closed', 'wall_reset', 'observation', 'finals_open', 'finals_closed', 'results') then
    raise exception 'Unsupported competition phase';
  end if;

  select *
  into v_competition
  from public.competitions
  where id = p_competition_id
  for update;

  if v_competition.id is null then
    raise exception 'Competition not found';
  end if;

  v_previous_phase := v_competition.current_phase;

  update public.competitions
  set
    current_phase = p_next_phase,
    stage_mode = public.phase_to_stage_mode(p_next_phase),
    qualifier_locked_at = case
      when p_next_phase in ('observation', 'finals_open', 'finals_closed', 'results') then coalesce(qualifier_locked_at, now())
      when p_next_phase = 'qualifier_open' then null
      else qualifier_locked_at
    end,
    finals_started_at = case
      when p_next_phase = 'finals_open' then coalesce(finals_started_at, now())
      when p_next_phase in ('qualifier_open', 'qualifier_closed', 'wall_reset') then null
      else finals_started_at
    end
  where id = p_competition_id
  returning * into v_competition;

  perform public.log_competition_phase_change(p_competition_id, v_previous_phase, p_next_phase, p_note);

  return v_competition;
end;
$$;

drop function if exists public.advance_competition_to_finals(uuid);

create or replace function public.advance_competition_to_finals(p_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competition public.competitions;
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

  if v_competition.current_phase not in ('qualifier_open', 'qualifier_closed', 'wall_reset') then
    raise exception 'Competition is not ready to advance to finals';
  end if;

  perform public.save_competition_operation(p_competition_id, 'advance');

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
  from public.compute_finalist_selection(p_competition_id);

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

drop function if exists public.reset_competition(uuid);

create or replace function public.reset_competition(p_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can reset a competition';
  end if;

  perform public.save_competition_operation(p_competition_id, 'reset');

  delete from public.final_attempts where competition_id = p_competition_id;
  delete from public.competition_finalists where competition_id = p_competition_id;
  delete from public.qualifier_attempts where competition_id = p_competition_id;
  delete from public.climbers where competition_id = p_competition_id;
  delete from public.competition_schedule_blocks where competition_id = p_competition_id;
  delete from public.competition_categories where competition_id = p_competition_id;
  delete from public.competition_rounds where competition_id = p_competition_id;

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
    p_competition_id,
    division,
    age_group,
    division || ' / ' || age_group,
    row_number() over (order by division, age_group) - 1
  from (
    values ('Men'), ('Women'), ('X')
  ) as divisions(division)
  cross join (
    values ('Youth D'), ('Youth C'), ('Youth B'), ('Youth A'), ('Junior'), ('Rec'), ('Masters'), ('Open')
  ) as ages(age_group);

  update public.competitions
  set
    current_phase = 'qualifier_open',
    stage_mode = 'qualifier',
    qualifier_locked_at = null,
    finals_started_at = null,
    finals_problem_count = 4
  where id = p_competition_id;

  perform public.log_competition_phase_change(p_competition_id, null, 'qualifier_open', 'Competition reset');
end;
$$;

create or replace function public.undo_last_competition_operation(p_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation public.competition_operations;
begin
  if not public.is_admin() then
    raise exception 'Only admins can undo competition operations';
  end if;

  select *
  into v_operation
  from public.competition_operations
  where competition_id = p_competition_id
    and consumed_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if v_operation.id is null then
    raise exception 'No undoable competition operation is available';
  end if;

  perform public.restore_competition_snapshot(p_competition_id, v_operation.snapshot);

  update public.competition_operations
  set consumed_at = now()
  where id = v_operation.id;
end;
$$;

alter table public.competition_phase_log enable row level security;
alter table public.competition_operations enable row level security;
alter table public.competition_rounds enable row level security;

create policy "competition phase log admin read"
on public.competition_phase_log for select
to authenticated
using (public.is_staff());

create policy "competition phase log admin write"
on public.competition_phase_log for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "competition operations admin read"
on public.competition_operations for select
to authenticated
using (public.is_admin());

create policy "competition operations admin write"
on public.competition_operations for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "competition rounds public read"
on public.competition_rounds for select
using (true);

create policy "competition rounds admin write"
on public.competition_rounds for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

do $$
begin
  begin
    alter publication supabase_realtime add table public.competition_phase_log;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.competition_rounds;
  exception when duplicate_object then null;
  end;
end $$;

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
      select jsonb_agg(to_jsonb(qa) order by qa.climber_id, qa.climb_number)
      from public.qualifier_attempts qa
      where qa.competition_id = p_competition_id
    ), '[]'::jsonb),
    'finalists', coalesce((
      select jsonb_agg(to_jsonb(cf) order by cf.display_category, cf.climbing_order, cf.qualifier_rank, cf.name)
      from public.competition_finalists cf
      where cf.competition_id = p_competition_id
    ), '[]'::jsonb),
    'final_attempts', coalesce((
      select jsonb_agg(to_jsonb(fa) order by fa.climber_id, fa.climb_number)
      from public.final_attempts fa
      where fa.competition_id = p_competition_id
    ), '[]'::jsonb),
    'rounds', coalesce((
      select jsonb_agg(to_jsonb(cr) order by cr.round_number)
      from public.competition_rounds cr
      where cr.competition_id = p_competition_id
    ), '[]'::jsonb)
  );
$$;

create or replace function public.save_competition_operation(
  p_competition_id uuid,
  p_operation_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation_id uuid;
begin
  insert into public.competition_operations (
    competition_id,
    operation_type,
    snapshot,
    expires_at,
    created_by
  )
  values (
    p_competition_id,
    p_operation_type,
    public.build_competition_snapshot_json(p_competition_id),
    now() + interval '30 seconds',
    auth.uid()
  )
  returning id into v_operation_id;

  return v_operation_id;
end;
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
    eligible_category_ids,
    created_at
  )
  select
    (block ->> 'id')::uuid,
    p_competition_id,
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
    (attempt ->> 'climber_id')::uuid,
    coalesce((attempt ->> 'climb_number')::integer, 1),
    coalesce((attempt ->> 'top')::boolean, false),
    coalesce((attempt ->> 'zone')::boolean, false),
    nullif(attempt ->> 'attempts_to_top', '')::integer,
    nullif(attempt ->> 'attempts_to_zone', '')::integer,
    coalesce(attempt ->> 'entered_by', 'staff'),
    coalesce(nullif(attempt ->> 'updated_at', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_snapshot -> 'final_attempts', '[]'::jsonb)) attempt;

  insert into public.competition_rounds (
    id,
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
    closed_at,
    created_at
  )
  select
    (round_entry ->> 'id')::uuid,
    p_competition_id,
    coalesce((round_entry ->> 'round_number')::integer, 1),
    round_entry ->> 'name',
    round_entry ->> 'round_type',
    round_entry ->> 'format',
    coalesce(round_entry ->> 'status', 'pending'),
    coalesce((round_entry ->> 'problem_count')::integer, 4),
    nullif(round_entry ->> 'counting_climbs', '')::integer,
    nullif(round_entry ->> 'finals_cutoff', '')::integer,
    nullif(round_entry ->> 'started_at', '')::timestamptz,
    nullif(round_entry ->> 'closed_at', '')::timestamptz,
    coalesce(nullif(round_entry ->> 'created_at', '')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_snapshot -> 'rounds', '[]'::jsonb)) round_entry;
end;
$$;

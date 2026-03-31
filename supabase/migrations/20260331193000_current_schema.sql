create extension if not exists pgcrypto;

drop view if exists public.finals_leaderboard_view;
drop view if exists public.finalists_view;
drop view if exists public.qualifier_leaderboard_view;
drop view if exists public.category_participants_view;

do $$
begin
  if to_regclass('auth.users') is not null then
    drop trigger if exists on_auth_user_created on auth.users;
  end if;

  if to_regclass('public.competition_settings') is not null then
    drop trigger if exists competition_settings_set_updated_at on public.competition_settings;
    drop policy if exists "Public can read settings" on public.competition_settings;
    drop policy if exists "Admins can update settings" on public.competition_settings;
  end if;

  if to_regclass('public.active_event_config') is not null then
    drop trigger if exists active_event_config_set_updated_at on public.active_event_config;
  end if;

  if to_regclass('public.profiles') is not null then
    drop policy if exists "Users can read own profile" on public.profiles;
    drop policy if exists "Admins can read all profiles" on public.profiles;
    drop policy if exists "Admins can update profiles" on public.profiles;
    drop policy if exists "profiles read own" on public.profiles;
    drop policy if exists "profiles update admin" on public.profiles;
  end if;

  if to_regclass('public.climbers') is not null then
    drop policy if exists "Public read climbers" on public.climbers;
    drop policy if exists "Staff insert climbers" on public.climbers;
    drop policy if exists "Staff update climbers" on public.climbers;
    drop policy if exists "Staff delete climbers" on public.climbers;
    drop policy if exists "climbers public read" on public.climbers;
    drop policy if exists "climbers public insert" on public.climbers;
    drop policy if exists "climbers staff update" on public.climbers;
    drop policy if exists "climbers staff delete" on public.climbers;
    drop policy if exists "climbers staff write" on public.climbers;
  end if;

  if to_regclass('public.climb_attempts') is not null then
    drop policy if exists "Public read attempts" on public.climb_attempts;
    drop policy if exists "Staff insert attempts" on public.climb_attempts;
    drop policy if exists "Staff update attempts" on public.climb_attempts;
    drop policy if exists "Staff delete attempts" on public.climb_attempts;
  end if;

  if to_regclass('public.event_categories') is not null then
    drop policy if exists "event categories public read" on public.event_categories;
    drop policy if exists "event categories admin write" on public.event_categories;
  end if;

  if to_regclass('public.event_time_slots') is not null then
    drop policy if exists "event slots public read" on public.event_time_slots;
    drop policy if exists "event slots admin write" on public.event_time_slots;
  end if;

  if to_regclass('public.event_finalists') is not null then
    drop policy if exists "event finalists public read" on public.event_finalists;
    drop policy if exists "event finalists admin write" on public.event_finalists;
  end if;

  if to_regclass('public.active_event_config') is not null then
    drop policy if exists "event config public read" on public.active_event_config;
    drop policy if exists "event config admin write" on public.active_event_config;
  end if;

  if to_regclass('public.qualifier_attempts') is not null then
    drop policy if exists "qualifier attempts public read" on public.qualifier_attempts;
    drop policy if exists "qualifier attempts staff write" on public.qualifier_attempts;
  end if;

  if to_regclass('public.final_attempts') is not null then
    drop policy if exists "final attempts public read" on public.final_attempts;
    drop policy if exists "final attempts staff write" on public.final_attempts;
  end if;
end $$;
drop function if exists public.reset_active_event();
drop function if exists public.advance_event_to_finals();
drop function if exists public.finals_staff_scoring_open();
drop function if exists public.qualifier_staff_scoring_open();
drop function if exists public.qualifier_self_scoring_open();
drop function if exists public.registration_open();
drop function if exists public.finals_open();
drop function if exists public.qualifiers_open();
drop function if exists public.submit_qualifier_attempt(text, integer, integer, boolean);
drop function if exists public.set_updated_at();
drop function if exists public.is_admin();
drop function if exists public.is_staff();
drop function if exists public.current_user_role();
drop function if exists public.handle_new_user();

drop table if exists public.final_attempts cascade;
drop table if exists public.event_finalists cascade;
drop table if exists public.qualifier_attempts cascade;
drop table if exists public.climbers cascade;
drop table if exists public.event_time_slots cascade;
drop table if exists public.event_categories cascade;
drop table if exists public.active_event_config cascade;
drop table if exists public.competition_settings cascade;
drop table if exists public.climb_attempts cascade;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'climber' check (role in ('admin', 'judge', 'climber')),
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'climber'),
    new.raw_user_meta_data ->> 'display_name'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin', 'judge'), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.active_event_config (
  id integer primary key default 1 check (id = 1),
  name text not null default 'Current Event',
  format text not null default 'scramble' check (format in ('scramble', 'five_on_five_off', 'flash_format', 'ifsc_finals_format')),
  stage_mode text not null default 'qualifier' check (stage_mode in ('qualifier', 'finals')),
  total_climbs integer not null default 30 check (total_climbs between 1 and 200),
  max_climbers integer not null default 80 check (max_climbers between 1 and 1000),
  qualifier_counting_climbs integer not null default 6 check (qualifier_counting_climbs between 1 and 20),
  finals_cutoff integer not null default 6 check (finals_cutoff in (6, 8)),
  finals_tie_advances boolean not null default true,
  qualifier_locked_at timestamptz,
  finals_started_at timestamptz,
  finals_problem_count integer not null default 4 check (finals_problem_count = 4),
  updated_at timestamptz not null default now()
);

insert into public.active_event_config (
  id,
  name,
  format,
  stage_mode,
  total_climbs,
  max_climbers,
  qualifier_counting_climbs,
  finals_cutoff,
  finals_tie_advances,
  qualifier_locked_at,
  finals_started_at,
  finals_problem_count
)
values (1, 'Current Event', 'scramble', 'qualifier', 30, 80, 6, 6, true, null, null, 4)
on conflict (id) do nothing;

create trigger active_event_config_set_updated_at
before update on public.active_event_config
for each row execute procedure public.set_updated_at();

create or replace function public.qualifiers_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select stage_mode = 'qualifier'
      from public.active_event_config
      where id = 1
    ),
    false
  )
$$;

create or replace function public.finals_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select stage_mode = 'finals'
      from public.active_event_config
      where id = 1
    ),
    false
  )
$$;

create table public.event_categories (
  id uuid primary key default gen_random_uuid(),
  event_id integer not null references public.active_event_config(id) on delete cascade default 1,
  gender_division text not null,
  age_group text not null,
  display_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, gender_division, age_group)
);

create table public.event_time_slots (
  id uuid primary key default gen_random_uuid(),
  event_id integer not null references public.active_event_config(id) on delete cascade default 1,
  label text not null,
  phase_type text not null default 'custom' check (phase_type in ('check_in', 'technical_meeting', 'isolation', 'qualifier_round', 'wall_reset', 'observation', 'finals_round', 'results', 'custom')),
  audience_label text not null default '',
  is_active boolean not null default false,
  start_time text,
  end_time text,
  capacity integer not null check (capacity > 0),
  eligible_category_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(eligible_category_ids) = 'array')
);

create table public.climbers (
  id uuid primary key default gen_random_uuid(),
  event_id integer not null references public.active_event_config(id) on delete cascade default 1,
  name text not null,
  climber_number text not null,
  province text not null,
  category_id uuid references public.event_categories(id) on delete set null,
  gender_division text not null,
  age_group text not null,
  display_category text not null,
  time_slot_id uuid references public.event_time_slots(id) on delete set null,
  access_token text not null unique,
  access_token_created_at timestamptz not null default now(),
  registered_at timestamptz not null default now(),
  unique (event_id, climber_number)
);

create or replace function public.registration_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with active_slot as (
    select phase_type
    from public.event_time_slots
    where event_id = 1
      and is_active = true
    order by created_at asc
    limit 1
  )
  select public.qualifiers_open()
    and coalesce(
      (
        select phase_type in ('check_in', 'technical_meeting', 'qualifier_round', 'custom')
        from active_slot
      ),
      true
    )
$$;

create or replace function public.qualifier_staff_scoring_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with active_slot as (
    select phase_type
    from public.event_time_slots
    where event_id = 1
      and is_active = true
    order by created_at asc
    limit 1
  )
  select public.qualifiers_open()
    and coalesce(
      (
        select phase_type in ('qualifier_round', 'custom')
        from active_slot
      ),
      true
    )
$$;

create or replace function public.qualifier_self_scoring_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with config as (
    select format
    from public.active_event_config
    where id = 1
  ),
  active_slot as (
    select phase_type
    from public.event_time_slots
    where event_id = 1
      and is_active = true
    order by created_at asc
    limit 1
  )
  select coalesce((select format = 'scramble' from config), false)
    and public.qualifiers_open()
    and coalesce(
      (
        select phase_type in ('qualifier_round', 'custom')
        from active_slot
      ),
      true
    )
$$;

create or replace function public.finals_staff_scoring_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with active_slot as (
    select phase_type
    from public.event_time_slots
    where event_id = 1
      and is_active = true
    order by created_at asc
    limit 1
  )
  select public.finals_open()
    and coalesce(
      (
        select phase_type in ('finals_round', 'custom')
        from active_slot
      ),
      true
    )
$$;

create table public.qualifier_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id integer not null references public.active_event_config(id) on delete cascade default 1,
  climber_id uuid not null references public.climbers(id) on delete cascade,
  climb_number integer not null check (climb_number >= 1),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  topped boolean not null default false,
  entered_by text not null default 'climber' check (entered_by in ('climber', 'staff')),
  updated_at timestamptz not null default now(),
  unique (climber_id, climb_number)
);

create table public.final_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id integer not null references public.active_event_config(id) on delete cascade default 1,
  climber_id uuid not null references public.climbers(id) on delete cascade,
  climb_number integer not null check (climb_number >= 1),
  top boolean not null default false,
  zone boolean not null default false,
  attempts_to_top integer check (attempts_to_top is null or attempts_to_top >= 0),
  attempts_to_zone integer check (attempts_to_zone is null or attempts_to_zone >= 0),
  entered_by text not null default 'staff' check (entered_by = 'staff'),
  updated_at timestamptz not null default now(),
  unique (climber_id, climb_number)
);

create table public.event_finalists (
  id uuid primary key default gen_random_uuid(),
  event_id integer not null references public.active_event_config(id) on delete cascade default 1,
  climber_id uuid not null references public.climbers(id) on delete cascade,
  name text not null,
  category_id text,
  display_category text not null,
  gender_division text not null,
  age_group text not null,
  qualifier_rank integer not null check (qualifier_rank > 0),
  advanced_with_tie boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, climber_id)
);

create index idx_event_categories_event on public.event_categories(event_id);
create index idx_event_slots_event on public.event_time_slots(event_id);
create index idx_climbers_event on public.climbers(event_id);
create index idx_climbers_category on public.climbers(category_id);
create index idx_climbers_slot on public.climbers(time_slot_id);
create index idx_climbers_access_token on public.climbers(access_token);
create index idx_qualifier_attempts_climber on public.qualifier_attempts(climber_id);
create index idx_final_attempts_climber on public.final_attempts(climber_id);
create index idx_event_finalists_event on public.event_finalists(event_id);
create index idx_event_finalists_climber on public.event_finalists(climber_id);

alter table public.profiles enable row level security;
alter table public.active_event_config enable row level security;
alter table public.event_categories enable row level security;
alter table public.event_time_slots enable row level security;
alter table public.climbers enable row level security;
alter table public.qualifier_attempts enable row level security;
alter table public.final_attempts enable row level security;
alter table public.event_finalists enable row level security;

create policy "profiles read own"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles update admin"
on public.profiles for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "event config public read"
on public.active_event_config for select
using (true);

create policy "event config admin write"
on public.active_event_config for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "event categories public read"
on public.event_categories for select
using (true);

create policy "event categories admin write"
on public.event_categories for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "event slots public read"
on public.event_time_slots for select
using (true);

create policy "event slots admin write"
on public.event_time_slots for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "event finalists public read"
on public.event_finalists for select
using (true);

create policy "event finalists admin write"
on public.event_finalists for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "climbers public read"
on public.climbers for select
using (true);

create policy "climbers public insert"
on public.climbers for insert
with check (public.registration_open());

create policy "climbers staff update"
on public.climbers for update to authenticated
using (public.is_staff())
with check (public.is_staff());

create policy "climbers staff delete"
on public.climbers for delete to authenticated
using (public.is_staff())
;

create policy "qualifier attempts public read"
on public.qualifier_attempts for select
using (true);

create policy "qualifier attempts staff write"
on public.qualifier_attempts for all to authenticated
using (public.is_staff() and public.qualifier_staff_scoring_open())
with check (public.is_staff() and public.qualifier_staff_scoring_open());

create policy "final attempts public read"
on public.final_attempts for select
using (true);

create policy "final attempts staff write"
on public.final_attempts for all to authenticated
using (
  public.is_staff()
  and public.finals_staff_scoring_open()
  and exists (
    select 1
    from public.event_finalists ef
    where ef.event_id = 1
      and ef.climber_id = final_attempts.climber_id
  )
)
with check (
  public.is_staff()
  and public.finals_staff_scoring_open()
  and exists (
    select 1
    from public.event_finalists ef
    where ef.event_id = 1
      and ef.climber_id = final_attempts.climber_id
  )
);

create or replace function public.submit_qualifier_attempt(
  p_access_token text,
  p_climb_number integer,
  p_attempt_count integer,
  p_topped boolean
)
returns public.qualifier_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_climber public.climbers;
  v_attempt public.qualifier_attempts;
begin
  if not public.qualifier_self_scoring_open() then
    raise exception 'Private qualifier scoring is only open during the live scramble round';
  end if;

  select *
  into v_climber
  from public.climbers
  where event_id = 1
    and access_token = p_access_token;

  if not found then
    raise exception 'Private qualifier link not recognized';
  end if;

  insert into public.qualifier_attempts (
    event_id,
    climber_id,
    climb_number,
    attempt_count,
    topped,
    entered_by
  )
  values (
    1,
    v_climber.id,
    p_climb_number,
    greatest(p_attempt_count, 0),
    p_topped,
    'climber'
  )
  on conflict (climber_id, climb_number)
  do update set
    attempt_count = excluded.attempt_count,
    topped = excluded.topped,
    entered_by = 'climber',
    updated_at = now()
  returning *
  into v_attempt;

  return v_attempt;
end;
$$;

grant execute on function public.submit_qualifier_attempt(text, integer, integer, boolean) to anon, authenticated;

create or replace function public.reset_active_event()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can reset the active event';
  end if;

  delete from public.final_attempts
  where event_id = 1;

  delete from public.event_finalists
  where event_id = 1;

  delete from public.qualifier_attempts
  where event_id = 1;

  delete from public.climbers
  where event_id = 1;

  delete from public.event_time_slots
  where event_id = 1;

  update public.active_event_config
  set
    name = 'Current Event',
    format = 'scramble',
    stage_mode = 'qualifier',
    total_climbs = 30,
    max_climbers = 80,
    qualifier_counting_climbs = 6,
    finals_cutoff = 6,
    finals_tie_advances = true,
    qualifier_locked_at = null,
    finals_started_at = null,
    finals_problem_count = 4
  where id = 1;
end;
$$;

grant execute on function public.reset_active_event() to authenticated;

create or replace function public.advance_event_to_finals()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.active_event_config;
begin
  if not public.is_admin() then
    raise exception 'Only admins can advance the event to finals';
  end if;

  select *
  into v_event
  from public.active_event_config
  where id = 1
  for update;

  if not found then
    raise exception 'Active event configuration not found';
  end if;

  if v_event.stage_mode <> 'qualifier' then
    raise exception 'This event has already advanced to finals';
  end if;

  if v_event.format <> 'scramble' then
    raise exception 'Only scramble events can be advanced to finals with this action';
  end if;

  delete from public.event_finalists
  where event_id = 1;

  insert into public.event_finalists (
    event_id,
    climber_id,
    name,
    category_id,
    display_category,
    gender_division,
    age_group,
    qualifier_rank,
    advanced_with_tie
  )
  with ranked as (
    select *
    from public.qualifier_leaderboard_view
    where age_group = 'Open'
      and gender_division in ('Men', 'Women')
  ),
  cutoff as (
    select
      category_id,
      total_score,
      topped_count,
      counting_attempt_total
    from ranked
    where category_row_number = v_event.finals_cutoff
  )
  select
    1,
    ranked.climber_id,
    ranked.name,
    ranked.category_id,
    ranked.display_category,
    ranked.gender_division,
    ranked.age_group,
    ranked.category_rank,
    ranked.category_row_number > v_event.finals_cutoff
  from ranked
  left join cutoff using (category_id)
  where ranked.category_row_number <= v_event.finals_cutoff
     or (
       v_event.finals_tie_advances
       and cutoff.category_id is not null
       and ranked.category_row_number > v_event.finals_cutoff
       and ranked.total_score = cutoff.total_score
       and ranked.topped_count = cutoff.topped_count
       and ranked.counting_attempt_total = cutoff.counting_attempt_total
     );

  delete from public.final_attempts
  where event_id = 1;

  update public.active_event_config
  set
    format = 'ifsc_finals_format',
    stage_mode = 'finals',
    qualifier_locked_at = coalesce(qualifier_locked_at, now()),
    finals_started_at = now(),
    finals_problem_count = 4
  where id = 1;
end;
$$;

grant execute on function public.advance_event_to_finals() to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.active_event_config;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.event_categories;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.event_time_slots;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.climbers;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.qualifier_attempts;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.final_attempts;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.event_finalists;
exception when duplicate_object then null;
end $$;

create or replace view public.category_participants_view as
select
  c.id as climber_id,
  c.name,
  c.climber_number,
  c.province,
  coalesce(c.category_id::text, c.gender_division || '::' || c.age_group) as category_id,
  c.display_category,
  c.gender_division,
  c.age_group,
  c.time_slot_id,
  ets.label as time_slot_label,
  c.registered_at
from public.climbers c
left join public.event_time_slots ets on ets.id = c.time_slot_id;

create or replace view public.qualifier_leaderboard_view as
with config as (
  select *
  from public.active_event_config
  where id = 1
),
route_scores as (
  select
    c.id as climber_id,
    c.name,
    c.climber_number,
    c.province,
    coalesce(c.category_id::text, c.gender_division || '::' || c.age_group) as category_id,
    c.display_category,
    c.gender_division,
    c.age_group,
    c.time_slot_id,
    qa.climb_number,
    qa.attempt_count,
    qa.topped,
    case
      when qa.topped then greatest((qa.climb_number * 1000) - (least(greatest(qa.attempt_count - 1, 0), 3) * 200), 0)
      else 0
    end as score
  from public.climbers c
  left join public.qualifier_attempts qa on qa.climber_id = c.id
),
counting_scores as (
  select
    rs.*,
    row_number() over (
      partition by rs.climber_id
      order by rs.score desc, rs.climb_number desc, rs.attempt_count asc
    ) as counting_order
  from route_scores rs
  where rs.score > 0
),
aggregated as (
  select
    c.id as climber_id,
    c.name,
    c.climber_number,
    c.province,
    coalesce(c.category_id::text, c.gender_division || '::' || c.age_group) as category_id,
    c.display_category,
    c.gender_division,
    c.age_group,
    c.time_slot_id,
    coalesce(sum(case when cs.counting_order <= cfg.qualifier_counting_climbs then cs.score else 0 end), 0) as total_score,
    coalesce(sum(case when cs.counting_order <= cfg.qualifier_counting_climbs and cs.topped then 1 else 0 end), 0) as topped_count,
    coalesce(sum(case when cs.counting_order <= cfg.qualifier_counting_climbs then cs.attempt_count else 0 end), 0) as counting_attempt_total,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'climb_number', cs.climb_number,
          'attempt_count', cs.attempt_count,
          'topped', cs.topped,
          'score', cs.score
        )
        order by cs.counting_order
      ) filter (where cs.counting_order <= cfg.qualifier_counting_climbs),
      '[]'::jsonb
    ) as counting_climbs
  from public.climbers c
  cross join config cfg
  left join counting_scores cs on cs.climber_id = c.id
  group by c.id, c.name, c.climber_number, c.province, c.category_id, c.display_category, c.gender_division, c.age_group, c.time_slot_id
)
select
  *,
  rank() over (
    order by total_score desc, topped_count desc, counting_attempt_total asc, name asc
  ) as overall_rank,
  rank() over (
    partition by category_id
    order by total_score desc, topped_count desc, counting_attempt_total asc, name asc
  ) as category_rank,
  row_number() over (
    partition by category_id
    order by total_score desc, topped_count desc, counting_attempt_total asc, name asc
  ) as category_row_number
from aggregated;

create or replace view public.finalists_view as
select
  ef.climber_id,
  ef.name,
  ef.category_id,
  ef.display_category,
  ef.gender_division,
  ef.age_group,
  ef.qualifier_rank,
  ef.advanced_with_tie,
  ef.created_at
from public.event_finalists ef
where ef.event_id = 1;

create or replace view public.finals_leaderboard_view as
with problems as (
  select
    ef.climber_id,
    ef.name,
    c.climber_number,
    c.province,
    ef.category_id,
    ef.display_category,
    ef.gender_division,
    ef.age_group,
    ef.qualifier_rank as previous_round_rank,
    p.climb_number,
    coalesce(fa.top, false) as top,
    coalesce(fa.zone, false) as zone,
    case
      when coalesce(fa.top, false) then greatest(coalesce(fa.attempts_to_top, 1), 1)
      else null
    end as attempts_to_top,
    case
      when coalesce(fa.zone, false) then greatest(coalesce(fa.attempts_to_zone, 1), 1)
      else null
    end as attempts_to_zone,
    round(
      greatest(
        case
          when coalesce(fa.top, false) then greatest(0::numeric, 25 - ((greatest(coalesce(fa.attempts_to_top, 1), 1) - 1) * 0.1))
          else 0::numeric
        end,
        case
          when coalesce(fa.zone, false) then greatest(0::numeric, 10 - ((greatest(coalesce(fa.attempts_to_zone, 1), 1) - 1) * 0.1))
          else 0::numeric
        end
      ),
      1
    ) as points
  from public.event_finalists ef
  join public.climbers c on c.id = ef.climber_id
  cross join generate_series(1, 4) as p(climb_number)
  left join public.final_attempts fa
    on fa.climber_id = ef.climber_id
   and fa.climb_number = p.climb_number
  where ef.event_id = 1
),
aggregated as (
  select
    climber_id,
    name,
    climber_number,
    province,
    category_id,
    display_category,
    gender_division,
    age_group,
    previous_round_rank,
    round(coalesce(sum(points), 0)::numeric, 1) as total_points,
    coalesce(sum(case when top then 1 else 0 end), 0) as tops,
    coalesce(sum(case when zone then 1 else 0 end), 0) as zones,
    coalesce(sum(case when top then attempts_to_top else 0 end), 0) as attempts_to_top,
    coalesce(sum(case when zone then attempts_to_zone else 0 end), 0) as attempts_to_zone,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'climb_number', climb_number,
          'top', top,
          'zone', zone,
          'attempts_to_top', attempts_to_top,
          'attempts_to_zone', attempts_to_zone,
          'points', points
        )
        order by climb_number
      ),
      '[]'::jsonb
    ) as problem_results
  from problems
  group by
    climber_id,
    name,
    climber_number,
    province,
    category_id,
    display_category,
    gender_division,
    age_group,
    previous_round_rank
)
select
  *,
  rank() over (
    order by total_points desc, previous_round_rank asc, name asc
  ) as overall_rank,
  rank() over (
    partition by category_id
    order by total_points desc, previous_round_rank asc, name asc
  ) as category_rank
from aggregated;

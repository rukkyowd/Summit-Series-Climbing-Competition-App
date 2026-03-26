-- ============================================================
-- CLIMBING COMPETITION DATABASE SCHEMA
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- AUTH PROFILES AND EVENT SETTINGS
-- ============================================================
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

create table if not exists public.competition_settings (
  id integer primary key default 1 check (id = 1),
  penalty_per_fail integer not null default 200 check (penalty_per_fail >= 0),
  max_penalized_fails integer not null default 3 check (max_penalized_fails >= 0),
  updated_at timestamptz not null default now()
);

insert into public.competition_settings (id, penalty_per_fail, max_penalized_fails)
values (1, 200, 3)
on conflict (id) do nothing;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists competition_settings_set_updated_at on public.competition_settings;

create trigger competition_settings_set_updated_at
before update on public.competition_settings
for each row execute procedure public.set_updated_at();

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

-- ============================================================
-- CLIMBERS
-- ============================================================
create table if not exists public.climbers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  climber_number text not null unique,
  category text not null default 'Mens Open',
  registered_at timestamptz not null default now()
);

alter table public.climbers
  add column if not exists category text not null default 'Mens Open';

-- ============================================================
-- CLIMB ATTEMPTS
-- ============================================================
create table if not exists public.climb_attempts (
  id uuid primary key default gen_random_uuid(),
  climber_id uuid not null references public.climbers(id) on delete cascade,
  climb_number integer not null,
  failed_attempts integer not null default 0,
  completed boolean not null default false,
  completion_time_seconds integer,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint climb_attempts_climber_route_unique unique (climber_id, climb_number)
);

alter table public.climb_attempts
  alter column started_at set default now();

do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.climb_attempts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%climb_number%';

  if constraint_name is not null then
    execute format('alter table public.climb_attempts drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.climb_attempts
  add constraint climb_attempts_climb_number_check
  check (climb_number between 1 and 30);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_climb_attempts_climber_id on public.climb_attempts(climber_id);
create index if not exists idx_climb_attempts_climb_number on public.climb_attempts(climb_number);
create index if not exists idx_climbers_number on public.climbers(climber_number);
create index if not exists idx_climbers_category on public.climbers(category);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.competition_settings enable row level security;
alter table public.climbers enable row level security;
alter table public.climb_attempts enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;
drop policy if exists "Public can read settings" on public.competition_settings;
drop policy if exists "Admins can update settings" on public.competition_settings;
drop policy if exists "Public read climbers" on public.climbers;
drop policy if exists "Staff insert climbers" on public.climbers;
drop policy if exists "Staff update climbers" on public.climbers;
drop policy if exists "Staff delete climbers" on public.climbers;
drop policy if exists "Public read attempts" on public.climb_attempts;
drop policy if exists "Staff insert attempts" on public.climb_attempts;
drop policy if exists "Staff update attempts" on public.climb_attempts;
drop policy if exists "Staff delete attempts" on public.climb_attempts;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Admins can read all profiles"
on public.profiles
for select
to authenticated
using (public.is_admin());

create policy "Admins can update profiles"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Public can read settings"
on public.competition_settings
for select
using (true);

create policy "Admins can update settings"
on public.competition_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Public read climbers"
on public.climbers
for select
using (true);

create policy "Staff insert climbers"
on public.climbers
for insert
to authenticated
with check (public.is_staff());

create policy "Staff update climbers"
on public.climbers
for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

create policy "Staff delete climbers"
on public.climbers
for delete
to authenticated
using (public.is_staff());

create policy "Public read attempts"
on public.climb_attempts
for select
using (true);

create policy "Staff insert attempts"
on public.climb_attempts
for insert
to authenticated
with check (public.is_staff());

create policy "Staff update attempts"
on public.climb_attempts
for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

create policy "Staff delete attempts"
on public.climb_attempts
for delete
to authenticated
using (public.is_staff());

-- ============================================================
-- REAL-TIME PUBLICATION
-- ============================================================
do $$
begin
  alter publication supabase_realtime add table public.climbers;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.climb_attempts;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.competition_settings;
exception
  when duplicate_object then null;
end $$;

-- ============================================================
-- CATEGORY-AWARE LEADERBOARD VIEW
-- ============================================================
create or replace view public.leaderboard_view as
with settings as (
  select penalty_per_fail, max_penalized_fails
  from public.competition_settings
  where id = 1
),
route_scores as (
  select
    c.id as climber_id,
    c.name,
    c.climber_number,
    c.category,
    coalesce(
      sum(
        case
          when ca.completed then (ca.climb_number * 1000) - (least(ca.failed_attempts, settings.max_penalized_fails) * settings.penalty_per_fail)
          else 0
        end
      ),
      0
    ) as total_score,
    coalesce(
      sum(
        case
          when ca.completed then ca.completion_time_seconds
          else 0
        end
      ),
      0
    ) as total_time_seconds,
    coalesce(
      sum(
        case
          when ca.completed then 1
          else 0
        end
      ),
      0
    ) as completed_climbs,
    coalesce(
      max(
        case
          when ca.completed then ca.climb_number
          else 0
        end
      ),
      0
    ) as highest_completed_climb
  from public.climbers c
  cross join settings
  left join public.climb_attempts ca on ca.climber_id = c.id
  group by c.id, c.name, c.climber_number, c.category
)
select
  climber_id,
  name,
  climber_number,
  category,
  total_score,
  total_time_seconds,
  completed_climbs,
  highest_completed_climb,
  rank() over (
    order by total_score desc, total_time_seconds asc, name asc
  ) as overall_rank,
  rank() over (
    partition by category
    order by total_score desc, total_time_seconds asc, name asc
  ) as category_rank
from route_scores;

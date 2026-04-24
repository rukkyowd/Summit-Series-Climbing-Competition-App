create extension if not exists pgcrypto;

drop trigger if exists on_auth_user_created on auth.users;

drop function if exists public.advance_competition_to_finals(uuid) cascade;
drop function if exists public.reset_competition(uuid) cascade;
drop function if exists public.submit_qualifier_attempt(text, uuid, integer, integer, boolean) cascade;
drop function if exists public.registration_open_for_competition(uuid) cascade;
drop function if exists public.qualifier_staff_scoring_open_for_competition(uuid) cascade;
drop function if exists public.qualifier_self_scoring_open_for_competition(uuid) cascade;
drop function if exists public.finals_staff_scoring_open_for_competition(uuid) cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.current_user_role() cascade;
drop function if exists public.is_staff() cascade;
drop function if exists public.is_admin() cascade;

drop table if exists public.final_attempts cascade;
drop table if exists public.competition_finalists cascade;
drop table if exists public.qualifier_attempts cascade;
drop table if exists public.climbers cascade;
drop table if exists public.competition_schedule_blocks cascade;
drop table if exists public.competition_categories cascade;
drop table if exists public.competitions cascade;
drop table if exists public.event_finalists cascade;
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
    'climber',
    new.raw_user_meta_data ->> 'display_name'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

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

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  format text not null default 'scramble' check (format in ('scramble', 'five_on_five_off', 'flash_format', 'ifsc_finals_format')),
  discipline_label text not null default 'Boulder',
  stage_mode text not null default 'qualifier' check (stage_mode in ('qualifier', 'finals')),
  location_name text not null default '',
  start_date date,
  end_date date,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  description text not null default '',
  hero_image_url text not null default '',
  total_climbs integer not null default 30 check (total_climbs between 1 and 200),
  max_climbers integer not null default 80 check (max_climbers between 1 and 1000),
  qualifier_counting_climbs integer not null default 6 check (qualifier_counting_climbs between 1 and 20),
  finals_cutoff integer not null default 6 check (finals_cutoff in (6, 8)),
  finals_tie_advances boolean not null default true,
  qualifier_eligible_age_groups jsonb not null default '["Youth D","Youth C","Youth B","Youth A","Junior","Rec","Masters","Open"]'::jsonb,
  finals_eligible_age_groups jsonb not null default '["Open"]'::jsonb,
  qualifier_locked_at timestamptz,
  finals_started_at timestamptz,
  finals_problem_count integer not null default 4 check (finals_problem_count = 4),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (jsonb_typeof(qualifier_eligible_age_groups) = 'array'),
  check (jsonb_typeof(finals_eligible_age_groups) = 'array')
);

create trigger competitions_set_updated_at
before update on public.competitions
for each row execute procedure public.set_updated_at();

create table public.competition_categories (
  id text not null,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  gender_division text not null,
  age_group text not null,
  display_name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (competition_id, id),
  unique (competition_id, gender_division, age_group)
);

create table public.competition_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  label text not null,
  phase_type text not null check (phase_type in ('check_in', 'technical_meeting', 'isolation', 'qualifier_round', 'wall_reset', 'observation', 'finals_round', 'results', 'custom')),
  audience_label text not null default '',
  is_active boolean not null default false,
  start_time text,
  end_time text,
  capacity integer not null default 20 check (capacity > 0),
  eligible_category_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(eligible_category_ids) = 'array')
);

create table public.climbers (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  name text not null,
  climber_number text not null,
  province text not null,
  category_id text,
  gender_division text not null,
  age_group text not null,
  display_category text not null,
  time_slot_id uuid references public.competition_schedule_blocks(id) on delete set null,
  access_token text not null unique,
  access_token_created_at timestamptz not null default now(),
  registered_at timestamptz not null default now(),
  foreign key (competition_id, category_id) references public.competition_categories(competition_id, id),
  unique (competition_id, climber_number)
);

create table public.qualifier_attempts (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  climber_id uuid not null references public.climbers(id) on delete cascade,
  climb_number integer not null check (climb_number > 0),
  attempt_count integer not null check (attempt_count >= 0),
  zone boolean not null default false,
  topped boolean not null default false,
  attempts_to_top integer,
  attempts_to_zone integer,
  entered_by text not null check (entered_by in ('climber', 'staff')),
  updated_at timestamptz not null default now(),
  check (not topped or zone),
  check (attempts_to_top is null or attempts_to_top > 0),
  check (attempts_to_zone is null or attempts_to_zone > 0),
  unique (climber_id, climb_number)
);

create table public.competition_finalists (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  climber_id uuid not null references public.climbers(id) on delete cascade,
  name text not null,
  category_id text,
  display_category text not null,
  gender_division text not null,
  age_group text not null,
  qualifier_rank integer not null,
  advanced_with_tie boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (competition_id, category_id) references public.competition_categories(competition_id, id),
  primary key (competition_id, climber_id)
);

create index competition_categories_sort_idx
on public.competition_categories (competition_id, sort_order, gender_division, age_group);

create index competition_schedule_blocks_competition_idx
on public.competition_schedule_blocks (competition_id, is_active, start_time);

create index climbers_competition_idx
on public.climbers (competition_id, registered_at, display_category);

create index qualifier_attempts_competition_idx
on public.qualifier_attempts (competition_id, climber_id, climb_number);

create index competition_finalists_competition_idx
on public.competition_finalists (competition_id, display_category, qualifier_rank);

create table public.final_attempts (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  climber_id uuid not null references public.climbers(id) on delete cascade,
  climb_number integer not null check (climb_number between 1 and 4),
  top boolean not null default false,
  zone boolean not null default false,
  attempts_to_top integer,
  attempts_to_zone integer,
  entered_by text not null default 'staff' check (entered_by = 'staff'),
  updated_at timestamptz not null default now(),
  unique (climber_id, climb_number)
);

create index final_attempts_competition_idx
on public.final_attempts (competition_id, climber_id, climb_number);

create or replace function public.registration_open_for_competition(p_competition_id uuid)
returns boolean
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
  active_block as (
    select phase_type
    from public.competition_schedule_blocks
    where competition_id = p_competition_id and is_active = true
    limit 1
  )
  select case
    when not exists (select 1 from competition_row) then false
    when (select stage_mode from competition_row) <> 'qualifier' then false
    when exists (select 1 from active_block)
      then coalesce((select phase_type in ('check_in', 'technical_meeting', 'qualifier_round', 'custom') from active_block), false)
    else true
  end
$$;

create or replace function public.qualifier_staff_scoring_open_for_competition(p_competition_id uuid)
returns boolean
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
  active_block as (
    select phase_type
    from public.competition_schedule_blocks
    where competition_id = p_competition_id and is_active = true
    limit 1
  )
  select case
    when not exists (select 1 from competition_row) then false
    when (select stage_mode from competition_row) <> 'qualifier' then false
    when exists (select 1 from active_block)
      then coalesce((select phase_type in ('qualifier_round', 'custom') from active_block), false)
    else true
  end
$$;

create or replace function public.qualifier_self_scoring_open_for_competition(p_competition_id uuid)
returns boolean
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
  active_block as (
    select phase_type
    from public.competition_schedule_blocks
    where competition_id = p_competition_id and is_active = true
    limit 1
  )
  select case
    when not exists (select 1 from competition_row) then false
    when (select stage_mode from competition_row) <> 'qualifier' then false
    when (select format from competition_row) <> 'scramble' then false
    when exists (select 1 from active_block)
      then coalesce((select phase_type in ('qualifier_round', 'custom') from active_block), false)
    else true
  end
$$;

create or replace function public.finals_staff_scoring_open_for_competition(p_competition_id uuid)
returns boolean
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
  active_block as (
    select phase_type
    from public.competition_schedule_blocks
    where competition_id = p_competition_id and is_active = true
    limit 1
  )
  select case
    when not exists (select 1 from competition_row) then false
    when (select stage_mode from competition_row) <> 'finals' then false
    when exists (select 1 from active_block)
      then coalesce((select phase_type in ('finals_round', 'custom') from active_block), false)
    else true
  end
$$;

create or replace function public.submit_qualifier_attempt(
  p_access_token text,
  p_competition_id uuid,
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
  values (
    p_competition_id,
    v_climber.id,
    p_climb_number,
    greatest(p_attempt_count, 0),
    p_topped,
    p_topped,
    case when p_topped then greatest(p_attempt_count, 1) else null end,
    case when p_topped then greatest(p_attempt_count, 1) else null end,
    'climber'
  )
  on conflict (climber_id, climb_number) do update
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

  delete from public.final_attempts where competition_id = p_competition_id;
  delete from public.competition_finalists where competition_id = p_competition_id;

  with climber_scores as (
    select
      c.id as climber_id,
      c.name,
      c.category_id,
      c.display_category,
      c.gender_division,
      c.age_group,
      q.climb_number,
      q.attempt_count,
      coalesce(q.zone, q.topped, false) as zone,
      q.topped,
      q.attempts_to_top,
      q.attempts_to_zone,
      case
        when v_competition.format = 'flash_format'
          then greatest(
            case
              when q.topped then greatest(0::numeric, 25 - (greatest(coalesce(q.attempts_to_top, q.attempt_count, 1), 1) - 1) * 0.1)
              else 0::numeric
            end,
            case
              when coalesce(q.zone, q.topped, false)
                then greatest(0::numeric, 10 - (greatest(coalesce(q.attempts_to_zone, q.attempts_to_top, q.attempt_count, 1), 1) - 1) * 0.1)
              else 0::numeric
            end
          )
        when q.topped
          then greatest(0, q.climb_number * 1000 - least(greatest(q.attempt_count - 1, 0), 3) * 200)
        else 0::numeric
      end as score
    from public.climbers c
    left join public.qualifier_attempts q on q.climber_id = c.id
    where c.competition_id = p_competition_id
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
      where score > 0::numeric
    ) ranked_scores
    where score_row <= case
      when v_competition.format = 'flash_format' then v_competition.total_climbs
      else v_competition.qualifier_counting_climbs
    end
  ),
  qualifier_totals as (
    select
      c.id as climber_id,
      c.name,
      c.category_id,
      c.display_category,
      c.gender_division,
      c.age_group,
      coalesce(sum(cs.score), 0::numeric) as total_score,
      coalesce(count(*) filter (where cs.topped), 0) as topped_count,
      coalesce(count(*) filter (where cs.zone), 0) as zone_count,
      coalesce(
        sum(
          case
            when cs.topped then greatest(coalesce(cs.attempts_to_top, cs.attempt_count, 0), 0)
            when cs.zone then greatest(coalesce(cs.attempts_to_zone, cs.attempt_count, 0), 0)
            else greatest(coalesce(cs.attempt_count, 0), 0)
          end
        ),
        0
      ) as counting_attempt_total
    from public.climbers c
    left join counting_scores cs on cs.climber_id = c.id
    where c.competition_id = p_competition_id
    group by c.id, c.name, c.category_id, c.display_category, c.gender_division, c.age_group
  ),
  ranked as (
    select
      qualifier_totals.*,
      row_number() over (
        partition by category_id
        order by total_score desc, topped_count desc, zone_count desc, counting_attempt_total asc, name asc
      ) as category_rank
    from qualifier_totals
    where gender_division in ('Men', 'Women')
      and age_group in (
        select jsonb_array_elements_text(v_competition.finals_eligible_age_groups)
      )
  ),
  cutoff as (
    select
      category_id,
      total_score,
      topped_count,
      zone_count,
      counting_attempt_total
    from ranked
    where category_rank = v_competition.finals_cutoff
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
    p_competition_id,
    ranked.climber_id,
    ranked.name,
    ranked.category_id,
    ranked.display_category,
    ranked.gender_division,
    ranked.age_group,
    ranked.category_rank,
    ranked.category_rank > v_competition.finals_cutoff
  from ranked
  left join cutoff using (category_id)
  where ranked.category_rank <= v_competition.finals_cutoff
     or (
       v_competition.finals_tie_advances
       and cutoff.category_id is not null
       and ranked.category_rank > v_competition.finals_cutoff
       and ranked.total_score = cutoff.total_score
       and ranked.topped_count = cutoff.topped_count
       and ranked.zone_count = cutoff.zone_count
       and ranked.counting_attempt_total = cutoff.counting_attempt_total
     );

  update public.competitions
  set
    format = 'ifsc_finals_format',
    stage_mode = 'finals',
    qualifier_locked_at = now(),
    finals_started_at = now(),
    finals_problem_count = 4
  where id = p_competition_id;
end;
$$;

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

  delete from public.final_attempts where competition_id = p_competition_id;
  delete from public.competition_finalists where competition_id = p_competition_id;
  delete from public.qualifier_attempts where competition_id = p_competition_id;
  delete from public.climbers where competition_id = p_competition_id;
  delete from public.competition_schedule_blocks where competition_id = p_competition_id;
  delete from public.competition_categories where competition_id = p_competition_id;

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
    format = 'scramble',
    stage_mode = 'qualifier',
    total_climbs = 30,
    max_climbers = 80,
    qualifier_counting_climbs = 6,
    finals_cutoff = 6,
    finals_tie_advances = true,
    qualifier_eligible_age_groups = '["Youth D","Youth C","Youth B","Youth A","Junior","Rec","Masters","Open"]'::jsonb,
    finals_eligible_age_groups = '["Open"]'::jsonb,
    qualifier_locked_at = null,
    finals_started_at = null,
    finals_problem_count = 4
  where id = p_competition_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_categories enable row level security;
alter table public.competition_schedule_blocks enable row level security;
alter table public.climbers enable row level security;
alter table public.qualifier_attempts enable row level security;
alter table public.competition_finalists enable row level security;
alter table public.final_attempts enable row level security;

create policy "profiles read own"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles update admin"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "competitions public read"
on public.competitions for select
using (true);

create policy "competitions admin write"
on public.competitions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "competition categories public read"
on public.competition_categories for select
using (true);

create policy "competition categories admin write"
on public.competition_categories for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "competition schedule public read"
on public.competition_schedule_blocks for select
using (true);

create policy "competition schedule admin write"
on public.competition_schedule_blocks for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "climbers public read"
on public.climbers for select
using (true);

create policy "climbers staff update"
on public.climbers for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

create policy "climbers staff delete"
on public.climbers for delete
to authenticated
using (public.is_staff());

create policy "qualifier attempts public read"
on public.qualifier_attempts for select
using (true);

create policy "qualifier attempts staff write"
on public.qualifier_attempts for all
to authenticated
using (public.is_staff() and public.qualifier_staff_scoring_open_for_competition(competition_id))
with check (public.is_staff() and public.qualifier_staff_scoring_open_for_competition(competition_id));

create policy "competition finalists public read"
on public.competition_finalists for select
using (true);

create policy "competition finalists admin write"
on public.competition_finalists for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "final attempts public read"
on public.final_attempts for select
using (true);

create policy "final attempts staff write"
on public.final_attempts for all
to authenticated
using (public.is_staff() and public.finals_staff_scoring_open_for_competition(competition_id))
with check (public.is_staff() and public.finals_staff_scoring_open_for_competition(competition_id));

do $$
begin
  begin
    alter publication supabase_realtime add table public.competitions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.competition_categories;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.competition_schedule_blocks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.climbers;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.qualifier_attempts;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.competition_finalists;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.final_attempts;
  exception when duplicate_object then null;
  end;
end $$;

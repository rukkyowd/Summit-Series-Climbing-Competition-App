create table if not exists public.competition_boulder_queue (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  climber_id uuid not null references public.climbers(id) on delete cascade,
  schedule_block_id uuid not null references public.competition_schedule_blocks(id) on delete cascade,
  climb_number integer not null check (climb_number >= 1),
  checked_in_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (competition_id, climber_id)
);

create index if not exists competition_boulder_queue_session_idx
on public.competition_boulder_queue (competition_id, schedule_block_id, climb_number, checked_in_at);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'competition_boulder_queue'
  ) then
    alter publication supabase_realtime add table public.competition_boulder_queue;
  end if;
end;
$$;

alter table public.competition_boulder_queue enable row level security;

create policy "competition boulder queue public read"
on public.competition_boulder_queue for select
using (true);

create policy "competition boulder queue staff write"
on public.competition_boulder_queue for all
to authenticated
using (public.is_staff())
with check (public.is_staff());

create or replace function public.join_live_boulder_queue(
  p_access_token text,
  p_competition_id uuid,
  p_climb_number integer
)
returns public.competition_boulder_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competition public.competitions%rowtype;
  v_climber public.climbers%rowtype;
  v_active_block public.competition_schedule_blocks%rowtype;
  v_entry public.competition_boulder_queue%rowtype;
begin
  select *
  into v_competition
  from public.competitions
  where id = p_competition_id
  for update;

  if not found then
    raise exception 'Competition not found.';
  end if;

  if v_competition.status <> 'active' or v_competition.current_phase <> 'qualifier_open' or v_competition.format <> 'scramble' then
    raise exception 'The live boulder queue opens only during an active scramble session.';
  end if;

  if p_climb_number < 1 or p_climb_number > v_competition.total_climbs then
    raise exception 'Please choose a valid boulder.';
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

  select *
  into v_active_block
  from public.competition_schedule_blocks
  where competition_id = p_competition_id
    and is_active = true
    and phase_type in ('qualifier_round', 'custom')
  order by start_time nulls last, created_at
  limit 1;

  if v_active_block.id is null then
    raise exception 'Queue check-in opens when staff marks a scramble session live.';
  end if;

  if v_climber.time_slot_id is not null and v_climber.time_slot_id <> v_active_block.id then
    raise exception 'This live queue is for a different scramble session than the one assigned to this climber.';
  end if;

  insert into public.competition_boulder_queue (
    competition_id,
    climber_id,
    schedule_block_id,
    climb_number,
    checked_in_at
  )
  values (
    p_competition_id,
    v_climber.id,
    v_active_block.id,
    p_climb_number,
    now()
  )
  on conflict (competition_id, climber_id) do update
  set
    schedule_block_id = excluded.schedule_block_id,
    climb_number = excluded.climb_number,
    checked_in_at = excluded.checked_in_at
  returning *
  into v_entry;

  return v_entry;
end;
$$;

create or replace function public.leave_live_boulder_queue(
  p_access_token text,
  p_competition_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_climber_id uuid;
begin
  select id
  into v_climber_id
  from public.climbers
  where access_token = trim(p_access_token)
    and competition_id = p_competition_id
  limit 1;

  if v_climber_id is null then
    raise exception 'Private qualifier link not recognized';
  end if;

  delete from public.competition_boulder_queue
  where competition_id = p_competition_id
    and climber_id = v_climber_id;
end;
$$;

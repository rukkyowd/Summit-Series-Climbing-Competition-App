create table if not exists public.qualifier_score_events (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  round_id uuid not null references public.competition_rounds(id) on delete cascade,
  climber_id uuid not null references public.climbers(id) on delete cascade,
  climb_number integer not null check (climb_number > 0),
  attempt_count integer not null check (attempt_count >= 0),
  zone boolean not null default false,
  topped boolean not null default false,
  attempts_to_top integer,
  attempts_to_zone integer,
  entered_by text not null check (entered_by in ('climber', 'staff')),
  judge_device_id text,
  judge_session_id text,
  scored_at timestamptz not null,
  received_at timestamptz not null default now(),
  client_event_id text not null,
  replayed_from_offline boolean not null default false,
  supersedes_event_id uuid references public.qualifier_score_events(id) on delete set null,
  conflict_flag boolean not null default false,
  conflict_reason text,
  check (not topped or zone),
  check (attempts_to_top is null or attempts_to_top > 0),
  check (attempts_to_zone is null or attempts_to_zone > 0),
  unique (client_event_id)
);

create table if not exists public.final_score_events (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  round_id uuid not null references public.competition_rounds(id) on delete cascade,
  climber_id uuid not null references public.climbers(id) on delete cascade,
  climb_number integer not null check (climb_number > 0),
  top boolean not null default false,
  zone boolean not null default false,
  attempts_to_top integer,
  attempts_to_zone integer,
  entered_by text not null default 'staff' check (entered_by = 'staff'),
  judge_device_id text,
  judge_session_id text,
  scored_at timestamptz not null,
  received_at timestamptz not null default now(),
  client_event_id text not null,
  replayed_from_offline boolean not null default false,
  supersedes_event_id uuid references public.final_score_events(id) on delete set null,
  conflict_flag boolean not null default false,
  conflict_reason text,
  check (attempts_to_top is null or attempts_to_top > 0),
  check (attempts_to_zone is null or attempts_to_zone > 0),
  unique (client_event_id)
);

create index if not exists qualifier_score_events_projection_idx
on public.qualifier_score_events (competition_id, round_id, climber_id, climb_number, scored_at desc, received_at desc, client_event_id desc);

create index if not exists final_score_events_projection_idx
on public.final_score_events (competition_id, round_id, climber_id, climb_number, scored_at desc, received_at desc, client_event_id desc);

alter table public.qualifier_score_events enable row level security;
alter table public.final_score_events enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'qualifier_score_events'
      and policyname = 'qualifier_score_events_select_authenticated'
  ) then
    create policy qualifier_score_events_select_authenticated
    on public.qualifier_score_events for select
    to authenticated
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'final_score_events'
      and policyname = 'final_score_events_select_authenticated'
  ) then
    create policy final_score_events_select_authenticated
    on public.final_score_events for select
    to authenticated
    using (true);
  end if;
end $$;

insert into public.qualifier_score_events (
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
  scored_at,
  received_at,
  client_event_id,
  replayed_from_offline,
  conflict_flag
)
select
  qa.competition_id,
  qa.round_id,
  qa.climber_id,
  qa.climb_number,
  qa.attempt_count,
  qa.zone,
  qa.topped,
  qa.attempts_to_top,
  qa.attempts_to_zone,
  qa.entered_by,
  coalesce(qa.updated_at, now()),
  coalesce(qa.updated_at, now()),
  concat('backfill-qualifier-', qa.id::text),
  false,
  false
from public.qualifier_attempts qa
where not exists (
  select 1
  from public.qualifier_score_events qse
  where qse.client_event_id = concat('backfill-qualifier-', qa.id::text)
);

insert into public.final_score_events (
  competition_id,
  round_id,
  climber_id,
  climb_number,
  top,
  zone,
  attempts_to_top,
  attempts_to_zone,
  entered_by,
  scored_at,
  received_at,
  client_event_id,
  replayed_from_offline,
  conflict_flag
)
select
  fa.competition_id,
  fa.round_id,
  fa.climber_id,
  fa.climb_number,
  fa.top,
  fa.zone,
  fa.attempts_to_top,
  fa.attempts_to_zone,
  fa.entered_by,
  coalesce(fa.updated_at, now()),
  coalesce(fa.updated_at, now()),
  concat('backfill-final-', fa.id::text),
  false,
  false
from public.final_attempts fa
where not exists (
  select 1
  from public.final_score_events fse
  where fse.client_event_id = concat('backfill-final-', fa.id::text)
);

create or replace function public.project_latest_qualifier_attempt(
  p_competition_id uuid,
  p_round_id uuid,
  p_climber_id uuid,
  p_climb_number integer
)
returns public.qualifier_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest public.qualifier_score_events;
  v_attempt public.qualifier_attempts;
begin
  select *
  into v_latest
  from public.qualifier_score_events
  where competition_id = p_competition_id
    and round_id = p_round_id
    and climber_id = p_climber_id
    and climb_number = p_climb_number
  order by scored_at desc, received_at desc, client_event_id desc
  limit 1;

  if v_latest.id is null then
    raise exception 'No qualifier score events are available for this cell.';
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
    entered_by,
    updated_at
  )
  values (
    v_latest.competition_id,
    v_latest.round_id,
    v_latest.climber_id,
    v_latest.climb_number,
    v_latest.attempt_count,
    v_latest.zone,
    v_latest.topped,
    v_latest.attempts_to_top,
    v_latest.attempts_to_zone,
    v_latest.entered_by,
    v_latest.scored_at
  )
  on conflict (competition_id, round_id, climber_id, climb_number) do update
  set
    attempt_count = excluded.attempt_count,
    zone = excluded.zone,
    topped = excluded.topped,
    attempts_to_top = excluded.attempts_to_top,
    attempts_to_zone = excluded.attempts_to_zone,
    entered_by = excluded.entered_by,
    updated_at = excluded.updated_at
  returning *
  into v_attempt;

  return v_attempt;
end;
$$;

create or replace function public.project_latest_final_attempt(
  p_competition_id uuid,
  p_round_id uuid,
  p_climber_id uuid,
  p_climb_number integer
)
returns public.final_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest public.final_score_events;
  v_attempt public.final_attempts;
begin
  select *
  into v_latest
  from public.final_score_events
  where competition_id = p_competition_id
    and round_id = p_round_id
    and climber_id = p_climber_id
    and climb_number = p_climb_number
  order by scored_at desc, received_at desc, client_event_id desc
  limit 1;

  if v_latest.id is null then
    raise exception 'No finals score events are available for this cell.';
  end if;

  insert into public.final_attempts (
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
  values (
    v_latest.competition_id,
    v_latest.round_id,
    v_latest.climber_id,
    v_latest.climb_number,
    v_latest.top,
    v_latest.zone,
    v_latest.attempts_to_top,
    v_latest.attempts_to_zone,
    v_latest.entered_by,
    v_latest.scored_at
  )
  on conflict (competition_id, round_id, climber_id, climb_number) do update
  set
    top = excluded.top,
    zone = excluded.zone,
    attempts_to_top = excluded.attempts_to_top,
    attempts_to_zone = excluded.attempts_to_zone,
    entered_by = excluded.entered_by,
    updated_at = excluded.updated_at
  returning *
  into v_attempt;

  return v_attempt;
end;
$$;

create or replace function public.append_qualifier_score_event(
  p_competition_id uuid,
  p_round_id uuid,
  p_climber_id uuid,
  p_climb_number integer,
  p_attempt_count integer,
  p_topped boolean,
  p_zone boolean default null,
  p_attempts_to_top integer default null,
  p_attempts_to_zone integer default null,
  p_entered_by text default 'staff',
  p_client_event_id text default null,
  p_scored_at timestamptz default now(),
  p_judge_device_id text default null,
  p_judge_session_id text default null,
  p_replayed_from_offline boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_event_id text := coalesce(nullif(trim(p_client_event_id), ''), gen_random_uuid()::text);
  v_event public.qualifier_score_events;
  v_previous_winner public.qualifier_score_events;
  v_latest public.qualifier_score_events;
  v_attempt public.qualifier_attempts;
  v_status text := 'accepted';
  v_conflict_reason text := null;
begin
  select *
  into v_previous_winner
  from public.qualifier_score_events
  where competition_id = p_competition_id
    and round_id = p_round_id
    and climber_id = p_climber_id
    and climb_number = p_climb_number
  order by scored_at desc, received_at desc, client_event_id desc
  limit 1;

  insert into public.qualifier_score_events (
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
    judge_device_id,
    judge_session_id,
    scored_at,
    client_event_id,
    replayed_from_offline
  )
  values (
    p_competition_id,
    p_round_id,
    p_climber_id,
    p_climb_number,
    greatest(p_attempt_count, 0),
    coalesce(p_zone, p_topped),
    p_topped,
    p_attempts_to_top,
    p_attempts_to_zone,
    p_entered_by,
    nullif(trim(coalesce(p_judge_device_id, '')), ''),
    nullif(trim(coalesce(p_judge_session_id, '')), ''),
    coalesce(p_scored_at, now()),
    v_client_event_id,
    coalesce(p_replayed_from_offline, false)
  )
  on conflict (client_event_id) do update
  set client_event_id = excluded.client_event_id
  returning *
  into v_event;

  select *
  into v_latest
  from public.qualifier_score_events
  where competition_id = p_competition_id
    and round_id = p_round_id
    and climber_id = p_climber_id
    and climb_number = p_climb_number
  order by scored_at desc, received_at desc, client_event_id desc
  limit 1;

  if v_latest.id = v_event.id then
    update public.qualifier_score_events
    set
      supersedes_event_id = v_previous_winner.id,
      conflict_flag = case
        when v_previous_winner.id is null then false
        when v_previous_winner.attempt_count = v_event.attempt_count
          and v_previous_winner.zone = v_event.zone
          and v_previous_winner.topped = v_event.topped
          and coalesce(v_previous_winner.attempts_to_top, -1) = coalesce(v_event.attempts_to_top, -1)
          and coalesce(v_previous_winner.attempts_to_zone, -1) = coalesce(v_event.attempts_to_zone, -1)
          then false
        when coalesce(v_previous_winner.judge_device_id, '') <> coalesce(v_event.judge_device_id, '')
          or coalesce(v_previous_winner.judge_session_id, '') <> coalesce(v_event.judge_session_id, '')
          then true
        else false
      end,
      conflict_reason = case
        when v_previous_winner.id is null then null
        when v_previous_winner.attempt_count = v_event.attempt_count
          and v_previous_winner.zone = v_event.zone
          and v_previous_winner.topped = v_event.topped
          and coalesce(v_previous_winner.attempts_to_top, -1) = coalesce(v_event.attempts_to_top, -1)
          and coalesce(v_previous_winner.attempts_to_zone, -1) = coalesce(v_event.attempts_to_zone, -1)
          then null
        when coalesce(v_previous_winner.judge_device_id, '') <> coalesce(v_event.judge_device_id, '')
          or coalesce(v_previous_winner.judge_session_id, '') <> coalesce(v_event.judge_session_id, '')
          then 'replaced_existing_score'
        else null
      end
    where id = v_event.id
    returning *
    into v_event;

    if v_event.conflict_flag then
      v_status := 'conflicted';
      v_conflict_reason := v_event.conflict_reason;
    elsif v_previous_winner.id is not null then
      v_status := 'projected';
    end if;
  else
    update public.qualifier_score_events
    set
      conflict_flag = true,
      conflict_reason = 'ignored_as_stale'
    where id = v_event.id
    returning *
    into v_event;

    v_status := 'ignored_as_stale';
    v_conflict_reason := 'ignored_as_stale';
  end if;

  v_attempt := public.project_latest_qualifier_attempt(
    p_competition_id,
    p_round_id,
    p_climber_id,
    p_climb_number
  );

  return jsonb_build_object(
    'status', v_status,
    'conflict_reason', v_conflict_reason,
    'attempt', to_jsonb(v_attempt),
    'event_id', v_event.id,
    'client_event_id', v_event.client_event_id,
    'scored_at', v_event.scored_at
  );
end;
$$;

create or replace function public.append_final_score_event(
  p_competition_id uuid,
  p_round_id uuid,
  p_climber_id uuid,
  p_climb_number integer,
  p_top boolean,
  p_zone boolean,
  p_attempts_to_top integer default null,
  p_attempts_to_zone integer default null,
  p_client_event_id text default null,
  p_scored_at timestamptz default now(),
  p_judge_device_id text default null,
  p_judge_session_id text default null,
  p_replayed_from_offline boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_event_id text := coalesce(nullif(trim(p_client_event_id), ''), gen_random_uuid()::text);
  v_event public.final_score_events;
  v_previous_winner public.final_score_events;
  v_latest public.final_score_events;
  v_attempt public.final_attempts;
  v_status text := 'accepted';
  v_conflict_reason text := null;
begin
  select *
  into v_previous_winner
  from public.final_score_events
  where competition_id = p_competition_id
    and round_id = p_round_id
    and climber_id = p_climber_id
    and climb_number = p_climb_number
  order by scored_at desc, received_at desc, client_event_id desc
  limit 1;

  insert into public.final_score_events (
    competition_id,
    round_id,
    climber_id,
    climb_number,
    top,
    zone,
    attempts_to_top,
    attempts_to_zone,
    entered_by,
    judge_device_id,
    judge_session_id,
    scored_at,
    client_event_id,
    replayed_from_offline
  )
  values (
    p_competition_id,
    p_round_id,
    p_climber_id,
    p_climb_number,
    p_top,
    p_zone,
    p_attempts_to_top,
    p_attempts_to_zone,
    'staff',
    nullif(trim(coalesce(p_judge_device_id, '')), ''),
    nullif(trim(coalesce(p_judge_session_id, '')), ''),
    coalesce(p_scored_at, now()),
    v_client_event_id,
    coalesce(p_replayed_from_offline, false)
  )
  on conflict (client_event_id) do update
  set client_event_id = excluded.client_event_id
  returning *
  into v_event;

  select *
  into v_latest
  from public.final_score_events
  where competition_id = p_competition_id
    and round_id = p_round_id
    and climber_id = p_climber_id
    and climb_number = p_climb_number
  order by scored_at desc, received_at desc, client_event_id desc
  limit 1;

  if v_latest.id = v_event.id then
    update public.final_score_events
    set
      supersedes_event_id = v_previous_winner.id,
      conflict_flag = case
        when v_previous_winner.id is null then false
        when v_previous_winner.top = v_event.top
          and v_previous_winner.zone = v_event.zone
          and coalesce(v_previous_winner.attempts_to_top, -1) = coalesce(v_event.attempts_to_top, -1)
          and coalesce(v_previous_winner.attempts_to_zone, -1) = coalesce(v_event.attempts_to_zone, -1)
          then false
        when coalesce(v_previous_winner.judge_device_id, '') <> coalesce(v_event.judge_device_id, '')
          or coalesce(v_previous_winner.judge_session_id, '') <> coalesce(v_event.judge_session_id, '')
          then true
        else false
      end,
      conflict_reason = case
        when v_previous_winner.id is null then null
        when v_previous_winner.top = v_event.top
          and v_previous_winner.zone = v_event.zone
          and coalesce(v_previous_winner.attempts_to_top, -1) = coalesce(v_event.attempts_to_top, -1)
          and coalesce(v_previous_winner.attempts_to_zone, -1) = coalesce(v_event.attempts_to_zone, -1)
          then null
        when coalesce(v_previous_winner.judge_device_id, '') <> coalesce(v_event.judge_device_id, '')
          or coalesce(v_previous_winner.judge_session_id, '') <> coalesce(v_event.judge_session_id, '')
          then 'replaced_existing_score'
        else null
      end
    where id = v_event.id
    returning *
    into v_event;

    if v_event.conflict_flag then
      v_status := 'conflicted';
      v_conflict_reason := v_event.conflict_reason;
    elsif v_previous_winner.id is not null then
      v_status := 'projected';
    end if;
  else
    update public.final_score_events
    set
      conflict_flag = true,
      conflict_reason = 'ignored_as_stale'
    where id = v_event.id
    returning *
    into v_event;

    v_status := 'ignored_as_stale';
    v_conflict_reason := 'ignored_as_stale';
  end if;

  v_attempt := public.project_latest_final_attempt(
    p_competition_id,
    p_round_id,
    p_climber_id,
    p_climb_number
  );

  return jsonb_build_object(
    'status', v_status,
    'conflict_reason', v_conflict_reason,
    'attempt', to_jsonb(v_attempt),
    'event_id', v_event.id,
    'client_event_id', v_event.client_event_id,
    'scored_at', v_event.scored_at
  );
end;
$$;

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
  v_round_id uuid;
  v_result jsonb;
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

  v_round_id := public.resolve_climber_linked_qualifier_round_id(p_competition_id, v_climber.id, p_round_id);

  v_result := public.append_qualifier_score_event(
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
  );

  select *
  into v_attempt
  from jsonb_populate_record(null::public.qualifier_attempts, v_result -> 'attempt');

  return v_attempt;
end;
$$;

create or replace function public.submit_staff_qualifier_attempt(
  p_competition_id uuid,
  p_climber_id uuid,
  p_climb_number integer,
  p_attempt_count integer,
  p_topped boolean,
  p_zone boolean default null,
  p_attempts_to_top integer default null,
  p_attempts_to_zone integer default null,
  p_round_id uuid default null
)
returns public.qualifier_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
  v_result jsonb;
  v_attempt public.qualifier_attempts;
begin
  if not public.is_staff() then
    raise exception 'Only staff can record qualifier scores';
  end if;

  if not public.qualifier_staff_scoring_open_for_competition(p_competition_id) then
    raise exception 'Qualifier scoring is not open during the current competition phase.';
  end if;

  v_round_id := public.resolve_climber_linked_qualifier_round_id(p_competition_id, p_climber_id, p_round_id);

  v_result := public.append_qualifier_score_event(
    p_competition_id,
    v_round_id,
    p_climber_id,
    p_climb_number,
    greatest(p_attempt_count, 0),
    p_topped,
    coalesce(p_zone, p_topped),
    p_attempts_to_top,
    p_attempts_to_zone,
    'staff'
  );

  select *
  into v_attempt
  from jsonb_populate_record(null::public.qualifier_attempts, v_result -> 'attempt');

  return v_attempt;
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
    'qualifier_score_events', coalesce((
      select jsonb_agg(to_jsonb(qse) order by qse.scored_at, qse.received_at, qse.client_event_id)
      from public.qualifier_score_events qse
      where qse.competition_id = p_competition_id
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
    'final_score_events', coalesce((
      select jsonb_agg(to_jsonb(fse) order by fse.scored_at, fse.received_at, fse.client_event_id)
      from public.final_score_events fse
      where fse.competition_id = p_competition_id
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
  v_has_qualifier_events boolean;
  v_has_final_events boolean;
begin
  v_competition := p_snapshot -> 'competition';

  if v_competition is null or v_competition = 'null'::jsonb then
    raise exception 'Competition snapshot missing competition row';
  end if;

  v_has_qualifier_events := jsonb_typeof(p_snapshot -> 'qualifier_score_events') = 'array';
  v_has_final_events := jsonb_typeof(p_snapshot -> 'final_score_events') = 'array';

  delete from public.final_score_events where competition_id = p_competition_id;
  delete from public.qualifier_score_events where competition_id = p_competition_id;
  delete from public.final_attempts where competition_id = p_competition_id;
  delete from public.competition_finalists where competition_id = p_competition_id;
  delete from public.qualifier_attempts where competition_id = p_competition_id;
  delete from public.climbers where competition_id = p_competition_id;
  delete from public.competition_schedule_blocks where competition_id = p_competition_id;
  delete from public.competition_categories where competition_id = p_competition_id;
  delete from public.competition_rounds where competition_id = p_competition_id;

  update public.competitions
  set
    slug = coalesce(v_competition ->> 'slug', slug),
    name = coalesce(v_competition ->> 'name', name),
    is_demo = coalesce((v_competition ->> 'is_demo')::boolean, is_demo),
    status = coalesce(v_competition ->> 'status', status),
    format = coalesce(v_competition ->> 'format', format),
    current_phase = coalesce(v_competition ->> 'current_phase', current_phase),
    discipline_label = coalesce(v_competition ->> 'discipline_label', discipline_label),
    stage_mode = coalesce(v_competition ->> 'stage_mode', stage_mode),
    location_name = coalesce(v_competition ->> 'location_name', location_name),
    start_date = coalesce((v_competition ->> 'start_date')::date, start_date),
    end_date = coalesce((v_competition ->> 'end_date')::date, end_date),
    registration_opens_at = coalesce((v_competition ->> 'registration_opens_at')::timestamptz, registration_opens_at),
    registration_closes_at = coalesce((v_competition ->> 'registration_closes_at')::timestamptz, registration_closes_at),
    description = coalesce(v_competition ->> 'description', description),
    hero_image_url = coalesce(v_competition ->> 'hero_image_url', hero_image_url),
    official_event_url = coalesce(v_competition ->> 'official_event_url', official_event_url),
    official_registration_url = coalesce(v_competition ->> 'official_registration_url', official_registration_url),
    official_schedule_url = coalesce(v_competition ->> 'official_schedule_url', official_schedule_url),
    total_climbs = coalesce((v_competition ->> 'total_climbs')::integer, total_climbs),
    max_climbers = coalesce((v_competition ->> 'max_climbers')::integer, max_climbers),
    qualifier_counting_climbs = coalesce((v_competition ->> 'qualifier_counting_climbs')::integer, qualifier_counting_climbs),
    has_finals = coalesce((v_competition ->> 'has_finals')::boolean, has_finals),
    finals_cutoff = coalesce((v_competition ->> 'finals_cutoff')::integer, finals_cutoff),
    finals_tie_advances = coalesce((v_competition ->> 'finals_tie_advances')::boolean, finals_tie_advances),
    qualifier_eligible_age_groups = coalesce(array(select jsonb_array_elements_text(v_competition -> 'qualifier_eligible_age_groups')), qualifier_eligible_age_groups),
    finals_eligible_age_groups = coalesce(array(select jsonb_array_elements_text(v_competition -> 'finals_eligible_age_groups')), finals_eligible_age_groups),
    qualifier_locked_at = coalesce((v_competition ->> 'qualifier_locked_at')::timestamptz, qualifier_locked_at),
    finals_started_at = coalesce((v_competition ->> 'finals_started_at')::timestamptz, finals_started_at),
    finals_problem_count = coalesce((v_competition ->> 'finals_problem_count')::integer, finals_problem_count)
  where id = p_competition_id;

  insert into public.competition_categories
  select *
  from jsonb_populate_recordset(null::public.competition_categories, coalesce(p_snapshot -> 'categories', '[]'::jsonb));

  insert into public.competition_schedule_blocks
  select *
  from jsonb_populate_recordset(null::public.competition_schedule_blocks, coalesce(p_snapshot -> 'schedule_blocks', '[]'::jsonb));

  insert into public.climbers
  select *
  from jsonb_populate_recordset(null::public.climbers, coalesce(p_snapshot -> 'climbers', '[]'::jsonb));

  insert into public.competition_rounds
  select *
  from jsonb_populate_recordset(null::public.competition_rounds, coalesce(p_snapshot -> 'rounds', '[]'::jsonb));

  insert into public.qualifier_attempts
  select *
  from jsonb_populate_recordset(null::public.qualifier_attempts, coalesce(p_snapshot -> 'qualifier_attempts', '[]'::jsonb));

  insert into public.competition_finalists
  select *
  from jsonb_populate_recordset(null::public.competition_finalists, coalesce(p_snapshot -> 'finalists', '[]'::jsonb));

  insert into public.final_attempts
  select *
  from jsonb_populate_recordset(null::public.final_attempts, coalesce(p_snapshot -> 'final_attempts', '[]'::jsonb));

  if v_has_qualifier_events then
    insert into public.qualifier_score_events
    select *
    from jsonb_populate_recordset(null::public.qualifier_score_events, coalesce(p_snapshot -> 'qualifier_score_events', '[]'::jsonb));
  else
    insert into public.qualifier_score_events (
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
      scored_at,
      received_at,
      client_event_id,
      replayed_from_offline,
      conflict_flag
    )
    select
      qa.competition_id,
      qa.round_id,
      qa.climber_id,
      qa.climb_number,
      qa.attempt_count,
      qa.zone,
      qa.topped,
      qa.attempts_to_top,
      qa.attempts_to_zone,
      qa.entered_by,
      coalesce(qa.updated_at, now()),
      coalesce(qa.updated_at, now()),
      concat('restore-qualifier-', qa.id::text),
      false,
      false
    from public.qualifier_attempts qa
    where qa.competition_id = p_competition_id;
  end if;

  if v_has_final_events then
    insert into public.final_score_events
    select *
    from jsonb_populate_recordset(null::public.final_score_events, coalesce(p_snapshot -> 'final_score_events', '[]'::jsonb));
  else
    insert into public.final_score_events (
      competition_id,
      round_id,
      climber_id,
      climb_number,
      top,
      zone,
      attempts_to_top,
      attempts_to_zone,
      entered_by,
      scored_at,
      received_at,
      client_event_id,
      replayed_from_offline,
      conflict_flag
    )
    select
      fa.competition_id,
      fa.round_id,
      fa.climber_id,
      fa.climb_number,
      fa.top,
      fa.zone,
      fa.attempts_to_top,
      fa.attempts_to_zone,
      fa.entered_by,
      coalesce(fa.updated_at, now()),
      coalesce(fa.updated_at, now()),
      concat('restore-final-', fa.id::text),
      false,
      false
    from public.final_attempts fa
    where fa.competition_id = p_competition_id;
  end if;
end;
$$;

grant execute on function public.project_latest_qualifier_attempt(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.project_latest_final_attempt(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.append_qualifier_score_event(uuid, uuid, uuid, integer, integer, boolean, boolean, integer, integer, text, text, timestamptz, text, text, boolean) to authenticated;
grant execute on function public.append_final_score_event(uuid, uuid, uuid, integer, boolean, boolean, integer, integer, text, timestamptz, text, text, boolean) to authenticated;

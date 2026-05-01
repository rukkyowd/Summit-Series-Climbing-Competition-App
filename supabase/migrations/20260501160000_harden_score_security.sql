-- Security-first hardening for public visibility and staff scoring writes.
-- Keeps the current global admin/judge model while removing direct browser access
-- to internal score-event helpers.

create or replace function public.competition_publicly_readable(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select c.status = 'active' or coalesce(c.is_demo, false)
    from public.competitions c
    where c.id = p_competition_id
  ), false)
$$;

create or replace function public.can_read_competition_scope(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.competition_publicly_readable(p_competition_id) or public.is_staff()
$$;

drop policy if exists "competitions public read" on public.competitions;
create policy "competitions active demo or staff read"
on public.competitions for select
using (status = 'active' or coalesce(is_demo, false) or public.is_staff());

drop policy if exists "competition categories public read" on public.competition_categories;
create policy "competition categories scoped read"
on public.competition_categories for select
using (public.can_read_competition_scope(competition_id));

drop policy if exists "competition schedule public read" on public.competition_schedule_blocks;
create policy "competition schedule scoped read"
on public.competition_schedule_blocks for select
using (public.can_read_competition_scope(competition_id));

drop policy if exists "competition rounds public read" on public.competition_rounds;
create policy "competition rounds scoped read"
on public.competition_rounds for select
using (public.can_read_competition_scope(competition_id));

drop policy if exists "climbers public read" on public.climbers;
create policy "climbers scoped read"
on public.climbers for select
using (public.can_read_competition_scope(competition_id));

drop policy if exists "qualifier attempts public read" on public.qualifier_attempts;
create policy "qualifier attempts scoped read"
on public.qualifier_attempts for select
using (public.can_read_competition_scope(competition_id));

drop policy if exists "competition finalists public read" on public.competition_finalists;
create policy "competition finalists scoped read"
on public.competition_finalists for select
using (public.can_read_competition_scope(competition_id));

drop policy if exists "final attempts public read" on public.final_attempts;
create policy "final attempts scoped read"
on public.final_attempts for select
using (public.can_read_competition_scope(competition_id));

drop policy if exists "competition boulder queue public read" on public.competition_boulder_queue;
create policy "competition boulder queue scoped read"
on public.competition_boulder_queue for select
using (public.can_read_competition_scope(competition_id));

drop policy if exists qualifier_score_events_select_authenticated on public.qualifier_score_events;
create policy qualifier_score_events_select_staff
on public.qualifier_score_events for select
to authenticated
using (public.is_staff() and public.can_read_competition_scope(competition_id));

drop policy if exists final_score_events_select_authenticated on public.final_score_events;
create policy final_score_events_select_staff
on public.final_score_events for select
to authenticated
using (public.is_staff() and public.can_read_competition_scope(competition_id));

-- Public leaderboard RPCs should obey the same RLS visibility rules as table reads.
alter function public.compute_qualifier_standings(uuid, uuid) security invoker;
alter function public.compute_finalist_selection(uuid, uuid, integer) security invoker;

create or replace function public.submit_staff_qualifier_score_event(
  p_competition_id uuid,
  p_climber_id uuid,
  p_climb_number integer,
  p_attempt_count integer,
  p_topped boolean,
  p_zone boolean default null,
  p_attempts_to_top integer default null,
  p_attempts_to_zone integer default null,
  p_client_event_id text default null,
  p_scored_at timestamptz default now(),
  p_judge_device_id text default null,
  p_judge_session_id text default null,
  p_replayed_from_offline boolean default false,
  p_round_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Only staff can record qualifier scores';
  end if;

  if not public.qualifier_staff_scoring_open_for_competition(p_competition_id) then
    raise exception 'Qualifier scoring is not open during the current competition phase.';
  end if;

  v_round_id := public.resolve_climber_linked_qualifier_round_id(
    p_competition_id,
    p_climber_id,
    p_round_id
  );

  if v_round_id is null then
    raise exception 'No active qualifier-style round is configured for scoring.';
  end if;

  return public.append_qualifier_score_event(
    p_competition_id,
    v_round_id,
    p_climber_id,
    p_climb_number,
    greatest(p_attempt_count, 0),
    p_topped,
    coalesce(p_zone, p_topped),
    p_attempts_to_top,
    p_attempts_to_zone,
    'staff',
    p_client_event_id,
    p_scored_at,
    p_judge_device_id,
    p_judge_session_id,
    coalesce(p_replayed_from_offline, false)
  );
end;
$$;

create or replace function public.submit_staff_final_score_event(
  p_competition_id uuid,
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
  p_replayed_from_offline boolean default false,
  p_round_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Only staff can record finals scores';
  end if;

  if not public.finals_staff_scoring_open_for_competition(p_competition_id) then
    raise exception 'Finals scoring is not open during the current competition phase.';
  end if;

  v_round_id := public.resolve_competition_scoring_round_id(p_competition_id, 'finals', p_round_id);

  if v_round_id is null then
    raise exception 'No active finals round is configured for scoring.';
  end if;

  if not exists (
    select 1
    from public.competition_finalists cf
    where cf.competition_id = p_competition_id
      and cf.climber_id = p_climber_id
  ) then
    raise exception 'Only finalists can receive finals scores.';
  end if;

  return public.append_final_score_event(
    p_competition_id,
    v_round_id,
    p_climber_id,
    p_climb_number,
    p_top,
    coalesce(p_zone, p_top),
    p_attempts_to_top,
    p_attempts_to_zone,
    p_client_event_id,
    p_scored_at,
    p_judge_device_id,
    p_judge_session_id,
    coalesce(p_replayed_from_offline, false)
  );
end;
$$;

revoke all on function public.project_latest_qualifier_attempt(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.project_latest_final_attempt(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.append_qualifier_score_event(uuid, uuid, uuid, integer, integer, boolean, boolean, integer, integer, text, text, timestamptz, text, text, boolean) from public, anon, authenticated;
revoke all on function public.append_final_score_event(uuid, uuid, uuid, integer, boolean, boolean, integer, integer, text, timestamptz, text, text, boolean) from public, anon, authenticated;
revoke all on function public.build_competition_snapshot_json(uuid) from public, anon, authenticated;
revoke all on function public.restore_competition_snapshot(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_competition_operation(uuid, text) from public, anon, authenticated;

grant execute on function public.project_latest_qualifier_attempt(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.project_latest_final_attempt(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.append_qualifier_score_event(uuid, uuid, uuid, integer, integer, boolean, boolean, integer, integer, text, text, timestamptz, text, text, boolean) to service_role;
grant execute on function public.append_final_score_event(uuid, uuid, uuid, integer, boolean, boolean, integer, integer, text, timestamptz, text, text, boolean) to service_role;
grant execute on function public.build_competition_snapshot_json(uuid) to service_role;
grant execute on function public.restore_competition_snapshot(uuid, jsonb) to service_role;
grant execute on function public.save_competition_operation(uuid, text) to service_role;

grant execute on function public.competition_publicly_readable(uuid) to anon, authenticated;
grant execute on function public.can_read_competition_scope(uuid) to anon, authenticated;
grant execute on function public.compute_qualifier_standings(uuid, uuid) to anon, authenticated;
grant execute on function public.compute_finalist_selection(uuid, uuid, integer) to anon, authenticated;
grant execute on function public.submit_qualifier_attempt(text, uuid, integer, integer, boolean, uuid) to anon, authenticated;
grant execute on function public.register_climber_for_competition(uuid, text, text, text, text, uuid, text) to anon, authenticated;
grant execute on function public.join_live_boulder_queue(text, uuid, integer) to anon, authenticated;
grant execute on function public.leave_live_boulder_queue(text, uuid) to anon, authenticated;
grant execute on function public.submit_staff_qualifier_attempt(uuid, uuid, integer, integer, boolean, boolean, integer, integer, uuid) to authenticated;
grant execute on function public.submit_staff_qualifier_score_event(uuid, uuid, integer, integer, boolean, boolean, integer, integer, text, timestamptz, text, text, boolean, uuid) to authenticated;
grant execute on function public.submit_staff_final_score_event(uuid, uuid, integer, boolean, boolean, integer, integer, text, timestamptz, text, text, boolean, uuid) to authenticated;

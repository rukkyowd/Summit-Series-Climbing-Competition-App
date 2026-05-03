create or replace function public.sync_competition_round_runtime_state(
  p_competition_id uuid,
  p_phase text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phase text;
  v_now timestamptz := now();
  v_active_round_id uuid;
begin
  select coalesce(p_phase, c.current_phase)
  into v_phase
  from public.competitions c
  where c.id = p_competition_id;

  if v_phase is null then
    raise exception 'Competition not found';
  end if;

  with candidate_rounds as (
    select
      cr.id,
      cr.sort_order,
      cr.round_number,
      cr.is_enabled,
      cr.is_active,
      cr.runtime_phase,
      cr.scoring_bucket,
      exists (
        select 1
        from public.competition_schedule_blocks csb
        where csb.competition_id = p_competition_id
          and csb.round_id = cr.id
          and csb.is_active = true
      ) as block_is_active
    from public.competition_rounds cr
    where cr.competition_id = p_competition_id
  )
  select cr.id
  into v_active_round_id
  from candidate_rounds cr
  order by
    case
      when cr.block_is_active
        and public.round_is_phase_compatible(v_phase, 'n/a', cr.scoring_bucket, cr.runtime_phase, cr.is_enabled, true) then 0
      when cr.is_active
        and public.round_is_phase_compatible(v_phase, 'n/a', cr.scoring_bucket, cr.runtime_phase, cr.is_enabled, true) then 1
      when cr.runtime_phase = v_phase
        and cr.is_enabled
        and cr.scoring_bucket = case when public.phase_to_stage_mode(v_phase) = 'qualifier' then 'qualifier' else 'finals' end then 2
      when cr.is_enabled
        and cr.scoring_bucket = case when public.phase_to_stage_mode(v_phase) = 'qualifier' then 'qualifier' else 'finals' end then 3
      when cr.runtime_phase = v_phase and cr.is_enabled then 4
      when cr.is_enabled then 5
      else 6
    end,
    cr.sort_order,
    cr.round_number
  limit 1;

  -- The one-active-round unique index is immediate, so deactivate first and
  -- activate the preferred round second instead of flipping both in one update.
  update public.competition_rounds cr
  set is_active = false
  where cr.competition_id = p_competition_id
    and cr.is_active = true
    and (v_active_round_id is null or cr.id <> v_active_round_id);

  update public.competition_rounds cr
  set
    is_active = cr.id = v_active_round_id,
    activated_at = case
      when cr.id = v_active_round_id then coalesce(cr.activated_at, v_now)
      else cr.activated_at
    end,
    closed_at = case
      when cr.id <> v_active_round_id
        and cr.scoring_bucket in ('qualifier', 'finals')
        and cr.activated_at is not null
        and (
          cr.scoring_bucket <> case when public.phase_to_stage_mode(v_phase) = 'qualifier' then 'qualifier' else 'finals' end
          or v_phase in ('finals_closed', 'results')
        ) then coalesce(cr.closed_at, v_now)
      else cr.closed_at
    end,
    status = case
      when cr.scoring_bucket = 'qualifier' then
        case
          when v_phase in ('qualifier_open', 'qualifier_closed', 'wall_reset') and cr.id = v_active_round_id then 'active'
          when cr.activated_at is not null or cr.closed_at is not null or v_phase not in ('qualifier_open', 'qualifier_closed', 'wall_reset') then 'closed'
          else 'pending'
        end
      when cr.scoring_bucket = 'finals' then
        case
          when v_phase in ('observation', 'finals_open') and cr.id = v_active_round_id then 'active'
          when cr.activated_at is not null or cr.closed_at is not null or v_phase in ('finals_closed', 'results') then 'closed'
          else 'pending'
        end
      else cr.status
    end
  where cr.competition_id = p_competition_id;

  return v_active_round_id;
end;
$$;

revoke all on function public.sync_competition_round_runtime_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.sync_competition_round_runtime_state(uuid, text)
  to service_role;

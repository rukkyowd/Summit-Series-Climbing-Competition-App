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
    select id, round_id, phase_type
    from public.competition_schedule_blocks
    where competition_id = p_competition_id
      and is_active = true
    order by coalesce(sort_order, 0), start_time nulls last, id
    limit 1
  ),
  active_rounds as (
    select cr.*
    from public.competition_rounds cr
    join competition_row c on c.id = cr.competition_id
    where cr.competition_id = p_competition_id
      and cr.scoring_bucket = 'qualifier'
      and public.round_is_phase_compatible(
        c.current_phase,
        cr.round_type,
        cr.scoring_bucket,
        cr.runtime_phase,
        cr.is_enabled,
        cr.is_active
      )
  ),
  has_rounds as (
    select exists (
      select 1
      from public.competition_rounds cr
      where cr.competition_id = p_competition_id
        and cr.scoring_bucket = 'qualifier'
        and cr.is_enabled = true
    ) as value
  )
  select case
    when not exists (select 1 from competition_row) then false
    when (select stage_mode from competition_row) <> 'qualifier' then false
    when (select current_phase from competition_row) not in ('qualifier_open', 'wall_reset') then false
    when exists (select 1 from active_block)
      and not coalesce((select phase_type in ('qualifier_round', 'custom') from active_block), false) then false
    when exists (select 1 from active_block where round_id is not null)
      then exists (
        select 1
        from active_rounds ar
        join active_block ab on ab.round_id = ar.id
      )
    when (select value from has_rounds)
      then exists (select 1 from active_rounds)
    else true
  end;
$$;

revoke all on function public.qualifier_staff_scoring_open_for_competition(uuid)
  from public, anon, authenticated;
grant execute on function public.qualifier_staff_scoring_open_for_competition(uuid)
  to authenticated;

create or replace function public.resolve_climber_linked_qualifier_round_id(
  p_competition_id uuid,
  p_climber_id uuid,
  p_requested_round_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competition public.competitions%rowtype;
  v_climber public.climbers%rowtype;
  v_slot public.competition_schedule_blocks%rowtype;
  v_round public.competition_rounds%rowtype;
  v_active_round public.competition_rounds%rowtype;
begin
  select *
  into v_competition
  from public.competitions
  where id = p_competition_id;

  if v_competition.id is null then
    raise exception 'Competition not found.';
  end if;

  select *
  into v_climber
  from public.climbers
  where id = p_climber_id
    and competition_id = p_competition_id;

  if v_climber.id is null then
    raise exception 'Climber not found.';
  end if;

  select cr.*
  into v_active_round
  from public.competition_rounds cr
  left join public.competition_schedule_blocks csb
    on csb.competition_id = p_competition_id
   and csb.round_id = cr.id
   and csb.is_active = true
  where cr.competition_id = p_competition_id
    and cr.scoring_bucket = 'qualifier'
    and public.round_is_phase_compatible(
      v_competition.current_phase,
      cr.round_type,
      cr.scoring_bucket,
      cr.runtime_phase,
      cr.is_enabled,
      cr.is_active
    )
  order by
    case when csb.id is not null then 0 else 1 end,
    cr.sort_order,
    cr.round_number
  limit 1;

  if v_active_round.id is null then
    raise exception 'No active qualifier-style round is configured for scoring.';
  end if;

  if p_requested_round_id is not null and p_requested_round_id <> v_active_round.id then
    raise exception 'This climber is assigned to a different round or session than the one currently being scored.';
  end if;

  if v_competition.current_phase <> 'qualifier_open' or v_active_round.round_type <> 'qualifier' then
    return v_active_round.id;
  end if;

  if v_climber.time_slot_id is null then
    raise exception 'This climber must be assigned to a session before qualifier scores can be recorded.';
  end if;

  select *
  into v_slot
  from public.competition_schedule_blocks
  where id = v_climber.time_slot_id
    and competition_id = p_competition_id;

  if v_slot.id is null then
    raise exception 'This climber is assigned to a session that no longer exists.';
  end if;

  if v_slot.round_id is null then
    raise exception 'This climber''s assigned session is not linked to a scoring round.';
  end if;

  select *
  into v_round
  from public.competition_rounds
  where id = v_slot.round_id
    and competition_id = p_competition_id;

  if v_round.id is null then
    raise exception 'This climber''s assigned session is not linked to a scoring round.';
  end if;

  if v_round.scoring_bucket <> 'qualifier' then
    raise exception 'That schedule block is not connected to a qualifier scoring round.';
  end if;

  if not v_round.is_enabled then
    raise exception 'That schedule block belongs to a round that is currently disabled.';
  end if;

  if v_round.id <> v_active_round.id then
    raise exception 'This climber is assigned to a different round or session than the one currently being scored.';
  end if;

  return v_round.id;
end;
$$;

revoke all on function public.resolve_climber_linked_qualifier_round_id(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_climber_linked_qualifier_round_id(uuid, uuid, uuid)
  to authenticated;

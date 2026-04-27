create or replace function public.round_is_phase_compatible(
  p_phase text,
  p_round_type text,
  p_scoring_bucket text,
  p_runtime_phase text,
  p_is_enabled boolean,
  p_is_active boolean
)
returns boolean
language sql
immutable
as $$
  select
    p_is_enabled = true
    and p_is_active = true
    and p_runtime_phase = p_phase
    and (
      case
        when public.phase_to_stage_mode(p_phase) = 'qualifier' then p_scoring_bucket = 'qualifier'
        else p_scoring_bucket = 'finals'
      end
    );
$$;

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
  ),
  preferred_round as (
    select cr.id
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
    limit 1
  ),
  updated as (
    update public.competition_rounds cr
    set
      is_active = cr.id = (select id from preferred_round),
      activated_at = case
        when cr.id = (select id from preferred_round) then coalesce(cr.activated_at, v_now)
        else cr.activated_at
      end,
      closed_at = case
        when cr.id <> (select id from preferred_round)
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
            when v_phase in ('qualifier_open', 'qualifier_closed', 'wall_reset') and cr.id = (select id from preferred_round) then 'active'
            when cr.activated_at is not null or cr.closed_at is not null or v_phase not in ('qualifier_open', 'qualifier_closed', 'wall_reset') then 'closed'
            else 'pending'
          end
        when cr.scoring_bucket = 'finals' then
          case
            when v_phase in ('observation', 'finals_open') and cr.id = (select id from preferred_round) then 'active'
            when cr.activated_at is not null or cr.closed_at is not null or v_phase in ('finals_closed', 'results') then 'closed'
            else 'pending'
          end
        else cr.status
      end
    where cr.competition_id = p_competition_id
    returning cr.id
  )
  select id
  into v_active_round_id
  from preferred_round;

  return v_active_round_id;
end;
$$;

grant execute on function public.sync_competition_round_runtime_state(uuid, text) to authenticated;

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

  perform public.sync_competition_round_runtime_state(p_competition_id, p_next_phase);
  perform public.log_competition_phase_change(p_competition_id, v_previous_phase, p_next_phase, p_note);

  select *
  into v_competition
  from public.competitions
  where id = p_competition_id;

  return v_competition;
end;
$$;

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

  if not public.round_is_phase_compatible(
    v_competition.current_phase,
    v_round.round_type,
    v_round.scoring_bucket,
    v_round.runtime_phase,
    v_round.is_enabled,
    v_round.is_active
  ) then
    raise exception 'That schedule block belongs to a round that is not active for the current phase.';
  end if;

  if p_requested_round_id is not null and p_requested_round_id <> v_round.id then
    raise exception 'This climber is assigned to a different round or session than the one currently being scored.';
  end if;

  return v_round.id;
end;
$$;

grant execute on function public.resolve_climber_linked_qualifier_round_id(uuid, uuid, uuid) to authenticated;

create or replace function public.register_climber_for_competition(
  p_competition_id uuid,
  p_name text,
  p_climber_number text,
  p_province text,
  p_category_id text,
  p_time_slot_id uuid default null,
  p_access_token text default null
)
returns public.climbers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competition public.competitions%rowtype;
  v_category public.competition_categories%rowtype;
  v_slot public.competition_schedule_blocks%rowtype;
  v_round public.competition_rounds%rowtype;
  v_total_count integer;
  v_slot_count integer;
  v_access_token text;
  v_climber public.climbers%rowtype;
begin
  select *
  into v_competition
  from public.competitions
  where id = p_competition_id
  for update;

  if not found then
    raise exception 'Competition not found.';
  end if;

  if not public.registration_open_for_competition(p_competition_id) then
    raise exception 'Registration is not open for this competition.';
  end if;

  select count(*)
  into v_total_count
  from public.climbers
  where competition_id = p_competition_id;

  if v_total_count >= v_competition.max_climbers then
    raise exception 'This competition is already at the configured climber capacity.';
  end if;

  select *
  into v_category
  from public.competition_categories
  where competition_id = p_competition_id
    and id = p_category_id;

  if not found then
    raise exception 'Please choose a valid category.';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements_text(v_competition.qualifier_eligible_age_groups) age_group
    where age_group = v_category.age_group
  ) then
    raise exception 'That age group is not enabled for qualifier registration in this competition.';
  end if;

  if p_time_slot_id is not null then
    select *
    into v_slot
    from public.competition_schedule_blocks
    where id = p_time_slot_id
      and competition_id = p_competition_id
    for update;

    if not found then
      raise exception 'Please choose a valid schedule block.';
    end if;

    if v_slot.phase_type <> 'qualifier_round' then
      raise exception 'That schedule block is not open for registration.';
    end if;

    if v_slot.round_id is not null then
      select *
      into v_round
      from public.competition_rounds
      where id = v_slot.round_id
        and competition_id = p_competition_id;

      if v_round.id is null then
        raise exception 'That schedule block is no longer linked to a valid round.';
      end if;

      if v_round.scoring_bucket <> 'qualifier' then
        raise exception 'That schedule block is not connected to a qualifier scoring round.';
      end if;

      if not v_round.is_enabled then
        raise exception 'That schedule block belongs to a round that is currently disabled.';
      end if;

      if not public.round_is_phase_compatible(
        v_competition.current_phase,
        v_round.round_type,
        v_round.scoring_bucket,
        v_round.runtime_phase,
        v_round.is_enabled,
        v_round.is_active
      ) then
        raise exception 'That schedule block belongs to a round that is not active for the current phase.';
      end if;
    elsif not exists (
      select 1
      from public.competition_rounds cr
      where cr.competition_id = p_competition_id
        and public.round_is_phase_compatible(
          v_competition.current_phase,
          cr.round_type,
          cr.scoring_bucket,
          cr.runtime_phase,
          cr.is_enabled,
          cr.is_active
        )
    ) then
      raise exception 'That schedule block belongs to a round that is not active for the current phase.';
    end if;

    if jsonb_array_length(v_slot.eligible_category_ids) > 0 and not exists (
      select 1
      from jsonb_array_elements_text(v_slot.eligible_category_ids) category_id
      where category_id = p_category_id
    ) then
      raise exception 'That schedule block is not available for the selected category.';
    end if;

    select count(*)
    into v_slot_count
    from public.climbers
    where time_slot_id = p_time_slot_id;

    if v_slot_count >= v_slot.capacity then
      raise exception 'That schedule block is already full.';
    end if;
  elsif exists (
    select 1
    from public.competition_schedule_blocks
    where competition_id = p_competition_id
      and capacity > 0
      and phase_type = 'qualifier_round'
  ) then
    raise exception 'Please choose a schedule block.';
  end if;

  v_access_token := nullif(trim(coalesce(p_access_token, '')), '');
  if v_access_token is null then
    v_access_token := encode(gen_random_bytes(16), 'hex');
  end if;

  insert into public.climbers (
    competition_id,
    name,
    climber_number,
    province,
    category_id,
    gender_division,
    age_group,
    display_category,
    time_slot_id,
    access_token
  )
  values (
    p_competition_id,
    trim(coalesce(p_name, '')),
    trim(coalesce(p_climber_number, '')),
    trim(coalesce(p_province, '')),
    v_category.id,
    v_category.gender_division,
    v_category.age_group,
    v_category.display_name,
    p_time_slot_id,
    v_access_token
  )
  returning *
  into v_climber;

  return v_climber;
exception
  when unique_violation then
    raise exception 'That climber number is already registered for this competition.';
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
  v_climber public.climbers%rowtype;
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

  v_round_id := public.resolve_climber_linked_qualifier_round_id(p_competition_id, v_climber.id, p_round_id);

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
  v_attempt public.qualifier_attempts;
  v_round_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Only staff can record qualifier scores';
  end if;

  if not public.qualifier_staff_scoring_open_for_competition(p_competition_id) then
    raise exception 'Qualifier scoring is not open during the current competition phase.';
  end if;

  v_round_id := public.resolve_climber_linked_qualifier_round_id(p_competition_id, p_climber_id, p_round_id);

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
    p_climber_id,
    p_climb_number,
    greatest(p_attempt_count, 0),
    coalesce(p_zone, p_topped),
    p_topped,
    p_attempts_to_top,
    p_attempts_to_zone,
    'staff'
  )
  on conflict (competition_id, round_id, climber_id, climb_number) do update
  set
    attempt_count = excluded.attempt_count,
    zone = excluded.zone,
    topped = excluded.topped,
    attempts_to_top = excluded.attempts_to_top,
    attempts_to_zone = excluded.attempts_to_zone,
    entered_by = 'staff',
    updated_at = now()
  returning *
  into v_attempt;

  return v_attempt;
end;
$$;

grant execute on function public.submit_staff_qualifier_attempt(uuid, uuid, integer, integer, boolean, boolean, integer, integer, uuid) to authenticated;

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

  perform public.sync_competition_round_runtime_state(p_competition_id, 'finals_open');
  perform public.log_competition_phase_change(p_competition_id, v_competition.current_phase, 'finals_open', 'Advanced to finals');
end;
$$;

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

    if v_slot.phase_type not in ('qualifier_round', 'custom') then
      raise exception 'That schedule block is not open for registration.';
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
      and phase_type in ('qualifier_round', 'custom')
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

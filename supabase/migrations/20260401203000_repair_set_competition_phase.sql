create or replace function public.log_competition_phase_change(
  p_competition_id uuid,
  p_from_phase text,
  p_to_phase text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.competition_phase_log (competition_id, from_phase, to_phase, changed_by, note)
  values (p_competition_id, p_from_phase, p_to_phase, auth.uid(), p_note);
end;
$$;

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

  perform public.log_competition_phase_change(p_competition_id, v_previous_phase, p_next_phase, p_note);

  return v_competition;
end;
$$;

alter table public.competitions
add column if not exists has_finals boolean not null default true;

create or replace function public.sync_competition_rounds(p_competition_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competition public.competitions%rowtype;
  v_qualifier_status text;
  v_finals_status text;
begin
  if not public.is_staff() then
    raise exception 'Only staff can sync competition rounds.';
  end if;

  select *
  into v_competition
  from public.competitions
  where id = p_competition_id;

  if not found then
    raise exception 'Competition not found.';
  end if;

  v_qualifier_status := case
    when v_competition.current_phase = 'qualifier_open' then 'active'
    when v_competition.current_phase in ('qualifier_closed', 'wall_reset', 'observation', 'finals_open', 'finals_closed', 'results') then 'closed'
    else 'pending'
  end;

  v_finals_status := case
    when v_competition.current_phase = 'observation' then 'scoring'
    when v_competition.current_phase = 'finals_open' then 'active'
    when v_competition.current_phase = 'finals_closed' then 'closed'
    when v_competition.current_phase = 'results' then 'results'
    else 'pending'
  end;

  insert into public.competition_rounds (
    competition_id,
    round_number,
    name,
    round_type,
    format,
    status,
    problem_count,
    counting_climbs,
    finals_cutoff,
    started_at,
    closed_at
  )
  values
    (
      v_competition.id,
      1,
      'Qualifier',
      'qualifier',
      v_competition.format,
      v_qualifier_status,
      v_competition.total_climbs,
      v_competition.qualifier_counting_climbs,
      case when v_competition.has_finals then v_competition.finals_cutoff else null end,
      case when v_competition.current_phase = 'qualifier_open' then v_competition.registration_opens_at else null end,
      case when v_competition.current_phase = 'qualifier_open' then null else v_competition.qualifier_locked_at end
    )
  on conflict (competition_id, round_number)
  do update set
    name = excluded.name,
    round_type = excluded.round_type,
    format = excluded.format,
    status = excluded.status,
    problem_count = excluded.problem_count,
    counting_climbs = excluded.counting_climbs,
    finals_cutoff = excluded.finals_cutoff,
    started_at = excluded.started_at,
    closed_at = excluded.closed_at;

  if v_competition.has_finals then
    insert into public.competition_rounds (
      competition_id,
      round_number,
      name,
      round_type,
      format,
      status,
      problem_count,
      counting_climbs,
      finals_cutoff,
      started_at,
      closed_at
    )
    values
      (
        v_competition.id,
        2,
        'Finals',
        'finals',
        'ifsc_finals_format',
        v_finals_status,
        v_competition.finals_problem_count,
        null,
        v_competition.finals_cutoff,
        v_competition.finals_started_at,
        case when v_competition.current_phase in ('finals_closed', 'results') then now() else null end
      )
    on conflict (competition_id, round_number)
    do update set
      name = excluded.name,
      round_type = excluded.round_type,
      format = excluded.format,
      status = excluded.status,
      problem_count = excluded.problem_count,
      counting_climbs = excluded.counting_climbs,
      finals_cutoff = excluded.finals_cutoff,
      started_at = excluded.started_at,
      closed_at = excluded.closed_at;
  else
    delete from public.competition_rounds
    where competition_id = v_competition.id
      and round_number = 2;
  end if;
end;
$$;

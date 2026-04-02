create or replace function public.registration_open_for_competition(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      status = 'active'
      and current_phase in ('qualifier_open', 'qualifier_closed')
      and (registration_opens_at is null or registration_opens_at <= now())
      and (registration_closes_at is null or registration_closes_at >= now())
      and (
        registration_opens_at is not null
        or registration_closes_at is not null
        or current_phase = 'qualifier_open'
      )
    from public.competitions
    where id = p_competition_id
  ), false)
$$;

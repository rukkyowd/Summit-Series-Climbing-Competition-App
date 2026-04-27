alter table public.competition_rounds
alter column eligible_category_ids drop default;

alter table public.competition_rounds
alter column eligible_category_ids type text[]
using coalesce(eligible_category_ids::text[], '{}'::text[]);

alter table public.competition_rounds
alter column eligible_category_ids set default '{}'::text[];

create or replace function public.save_competition_rounds(
  p_competition_id uuid,
  p_rounds jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can save competition rounds';
  end if;

  delete from public.competition_rounds
  where competition_id = p_competition_id;

  if jsonb_typeof(coalesce(p_rounds, '[]'::jsonb)) <> 'array' then
    raise exception 'Rounds payload must be a JSON array';
  end if;

  for v_round in
    select value
    from jsonb_array_elements(coalesce(p_rounds, '[]'::jsonb))
  loop
    insert into public.competition_rounds (
      id,
      competition_id,
      round_number,
      sort_order,
      name,
      round_type,
      format,
      status,
      runtime_phase,
      is_enabled,
      is_active,
      activated_at,
      problem_count,
      counting_climbs,
      finals_cutoff,
      eligible_category_ids,
      advancement_source_round_id,
      advancement_cutoff,
      scoring_bucket,
      scoring_config,
      started_at,
      closed_at
    )
    values (
      coalesce(nullif(v_round ->> 'id', '')::uuid, gen_random_uuid()),
      p_competition_id,
      coalesce((v_round ->> 'round_number')::integer, 1),
      coalesce((v_round ->> 'sort_order')::integer, coalesce((v_round ->> 'round_number')::integer, 1)),
      coalesce(nullif(v_round ->> 'name', ''), 'Round'),
      coalesce(nullif(v_round ->> 'round_type', ''), 'qualifier'),
      coalesce(nullif(v_round ->> 'format', ''), 'scramble'),
      coalesce(nullif(v_round ->> 'status', ''), 'pending'),
      coalesce(nullif(v_round ->> 'runtime_phase', ''), 'qualifier_open'),
      coalesce((v_round ->> 'is_enabled')::boolean, true),
      coalesce((v_round ->> 'is_active')::boolean, false),
      nullif(v_round ->> 'activated_at', '')::timestamptz,
      coalesce((v_round ->> 'problem_count')::integer, 4),
      nullif(v_round ->> 'counting_climbs', '')::integer,
      nullif(v_round ->> 'finals_cutoff', '')::integer,
      coalesce(array(select jsonb_array_elements_text(coalesce(v_round -> 'eligible_category_ids', '[]'::jsonb))), '{}'::text[]),
      nullif(v_round ->> 'advancement_source_round_id', '')::uuid,
      nullif(v_round ->> 'advancement_cutoff', '')::integer,
      coalesce(nullif(v_round ->> 'scoring_bucket', ''), 'none'),
      coalesce(v_round -> 'scoring_config', '{}'::jsonb),
      nullif(v_round ->> 'started_at', '')::timestamptz,
      nullif(v_round ->> 'closed_at', '')::timestamptz
    );
  end loop;
end;
$$;

grant execute on function public.save_competition_rounds(uuid, jsonb) to authenticated;

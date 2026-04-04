create or replace function public.save_competition_operation(
  p_competition_id uuid,
  p_operation_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation_id uuid;
begin
  insert into public.competition_operations (
    competition_id,
    operation_type,
    snapshot,
    expires_at,
    created_by
  )
  values (
    p_competition_id,
    p_operation_type,
    public.build_competition_snapshot_json(p_competition_id),
    now() + interval '5 minutes',
    auth.uid()
  )
  returning id into v_operation_id;

  return v_operation_id;
end;
$$;

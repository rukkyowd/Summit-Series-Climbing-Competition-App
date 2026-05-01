-- Security Pass 2: browser clients no longer call legacy staff/admin mutation RPCs directly.
-- Protected Next.js route handlers execute these functions with the service role after server-side auth checks.

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.role() = 'service_role' then 'admin'
    else (
      select role
      from public.profiles
      where id = auth.uid()
    )
  end
$$;

revoke all on function public.submit_staff_qualifier_attempt(uuid, uuid, integer, integer, boolean, boolean, integer, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.submit_staff_qualifier_attempt(uuid, uuid, integer, integer, boolean, boolean, integer, integer, uuid)
  to service_role;

revoke all on function public.save_competition_rounds(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_competition_rounds(uuid, jsonb)
  to service_role;

revoke all on function public.sync_competition_round_runtime_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.sync_competition_round_runtime_state(uuid, text)
  to service_role;

revoke all on function public.set_competition_phase(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_competition_phase(uuid, text, text)
  to service_role;

revoke all on function public.advance_competition_to_finals(uuid)
  from public, anon, authenticated;
grant execute on function public.advance_competition_to_finals(uuid)
  to service_role;

revoke all on function public.reset_competition(uuid)
  from public, anon, authenticated;
grant execute on function public.reset_competition(uuid)
  to service_role;

revoke all on function public.undo_last_competition_operation(uuid)
  from public, anon, authenticated;
grant execute on function public.undo_last_competition_operation(uuid)
  to service_role;

-- Checked staff wrappers remain callable by authenticated sessions, but enforce is_staff()
-- and competition/phase/finalist validation internally.
grant execute on function public.submit_staff_qualifier_score_event(
  uuid, uuid, integer, integer, boolean, boolean, integer, integer, text, timestamptz, text, text, boolean, uuid
) to authenticated;
grant execute on function public.submit_staff_final_score_event(
  uuid, uuid, integer, boolean, boolean, integer, integer, text, timestamptz, text, text, boolean, uuid
) to authenticated;

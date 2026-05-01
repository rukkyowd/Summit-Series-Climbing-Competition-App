-- Security boundary verification for Security Pass 2.
-- Run against a local/linked Supabase database as an owner role that may SET ROLE.
-- The boolean privilege checks should all match the "expected" column.

select
  'anon cannot execute append_qualifier_score_event' as check_name,
  false as expected,
  has_function_privilege(
    'anon',
    'public.append_qualifier_score_event(uuid, uuid, uuid, integer, integer, boolean, boolean, integer, integer, text, text, timestamptz, text, text, boolean)',
    'execute'
  ) as actual;

select
  'authenticated cannot execute append_qualifier_score_event' as check_name,
  false as expected,
  has_function_privilege(
    'authenticated',
    'public.append_qualifier_score_event(uuid, uuid, uuid, integer, integer, boolean, boolean, integer, integer, text, text, timestamptz, text, text, boolean)',
    'execute'
  ) as actual;

select
  'authenticated cannot execute legacy submit_staff_qualifier_attempt' as check_name,
  false as expected,
  has_function_privilege(
    'authenticated',
    'public.submit_staff_qualifier_attempt(uuid, uuid, integer, integer, boolean, boolean, integer, integer, uuid)',
    'execute'
  ) as actual;

select
  'authenticated can execute checked qualifier wrapper' as check_name,
  true as expected,
  has_function_privilege(
    'authenticated',
    'public.submit_staff_qualifier_score_event(uuid, uuid, integer, integer, boolean, boolean, integer, integer, text, timestamptz, text, text, boolean, uuid)',
    'execute'
  ) as actual;

select
  'authenticated can execute checked finals wrapper' as check_name,
  true as expected,
  has_function_privilege(
    'authenticated',
    'public.submit_staff_final_score_event(uuid, uuid, integer, boolean, boolean, integer, integer, text, timestamptz, text, text, boolean, uuid)',
    'execute'
  ) as actual;

select
  'anon cannot execute service-only phase change' as check_name,
  false as expected,
  has_function_privilege('anon', 'public.set_competition_phase(uuid, text, text)', 'execute') as actual;

select
  'authenticated cannot execute service-only phase change' as check_name,
  false as expected,
  has_function_privilege('authenticated', 'public.set_competition_phase(uuid, text, text)', 'execute') as actual;

begin;
  set local role anon;
  select
    'anon archived/non-demo competition rows visible' as check_name,
    0 as expected,
    count(*) as actual
  from public.competitions
  where status = 'archived'
    and coalesce(is_demo, false) = false;
rollback;

-- Optional live wrapper checks:
-- 1. Replace the placeholders below with real ids in a throwaway local database.
-- 2. First use a non-staff user id and expect "Staff role required."
-- 3. Then use a judge/admin user id and expect the wrapper to accept or return a domain conflict
--    such as "Qualifier scoring is not open..." based on the competition phase.
--
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claim.sub', '<non_staff_user_uuid>', true);
--   select public.submit_staff_qualifier_score_event(
--     '<competition_uuid>', '<climber_uuid>', 1, 1, true, true, 1, 1,
--     'verification-event-id', now(), 'verification-device', 'verification-session', false, null
--   );
-- rollback;

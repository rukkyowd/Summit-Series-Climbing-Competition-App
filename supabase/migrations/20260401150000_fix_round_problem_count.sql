alter table public.competition_rounds
drop constraint if exists competition_rounds_problem_count_check;

alter table public.competition_rounds
add constraint competition_rounds_problem_count_check
check (
  (
    round_type = 'finals'
    and problem_count between 1 and 8
  )
  or (
    round_type in ('qualifier', 'semifinal')
    and problem_count between 1 and 200
  )
);

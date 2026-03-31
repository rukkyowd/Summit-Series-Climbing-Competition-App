insert into public.event_finalists (
  event_id,
  climber_id,
  name,
  category_id,
  display_category,
  gender_division,
  age_group,
  qualifier_rank,
  advanced_with_tie
)
with config as (
  select *
  from public.active_event_config
  where id = 1
),
ranked as (
  select *
  from public.qualifier_leaderboard_view
  cross join config
  where gender_division in ('Men', 'Women')
    and exists (
      select 1
      from jsonb_array_elements_text(config.finals_eligible_age_groups) as eligible(age_group)
      where eligible.age_group = qualifier_leaderboard_view.age_group
    )
),
cutoff as (
  select
    ranked.category_id,
    ranked.total_score,
    ranked.topped_count,
    ranked.counting_attempt_total
  from ranked
  cross join config
  where ranked.category_row_number = config.finals_cutoff
)
select
  1,
  ranked.climber_id,
  ranked.name,
  ranked.category_id,
  ranked.display_category,
  ranked.gender_division,
  ranked.age_group,
  ranked.category_rank,
  ranked.category_row_number > config.finals_cutoff
from ranked
cross join config
left join cutoff using (category_id)
where ranked.category_row_number <= config.finals_cutoff
   or (
     config.finals_tie_advances
     and cutoff.category_id is not null
     and ranked.category_row_number > config.finals_cutoff
     and ranked.total_score = cutoff.total_score
     and ranked.topped_count = cutoff.topped_count
     and ranked.counting_attempt_total = cutoff.counting_attempt_total
   );

update public.event_time_slots
set is_active = false
where event_id = 1;

update public.event_time_slots
set is_active = true
where event_id = 1
  and label = 'Event - Youth Competitive Finals';

update public.active_event_config
set
  format = 'ifsc_finals_format',
  stage_mode = 'finals',
  qualifier_locked_at = now(),
  finals_started_at = now(),
  finals_problem_count = 4
where id = 1;

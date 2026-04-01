update public.competition_schedule_blocks
set is_active = false
where competition_id = (select id from public.competitions where slug = 'spring-send-youth-competitive');

update public.competition_schedule_blocks
set is_active = true
where competition_id = (select id from public.competitions where slug = 'spring-send-youth-competitive')
  and phase_type = 'finals_round';

delete from public.final_attempts
where competition_id = (select id from public.competitions where slug = 'spring-send-youth-competitive');

delete from public.competition_finalists
where competition_id = (select id from public.competitions where slug = 'spring-send-youth-competitive');

with target as (
  select *
  from public.competitions
  where slug = 'spring-send-youth-competitive'
),
climber_scores as (
  select
    c.id as climber_id,
    c.name,
    c.category_id,
    c.display_category,
    c.gender_division,
    c.age_group,
    q.climb_number,
    q.attempt_count,
    q.topped,
    case
      when q.topped
        then greatest(0, q.climb_number * 1000 - least(greatest(q.attempt_count - 1, 0), 3) * 200)
      else 0
    end as score
  from public.climbers c
  join target on target.id = c.competition_id
  left join public.qualifier_attempts q on q.climber_id = c.id
),
counting_scores as (
  select *
  from (
    select
      climber_scores.*,
      row_number() over (
        partition by climber_id
        order by score desc, climb_number desc, attempt_count asc
      ) as score_row
    from climber_scores
    where score > 0
  ) ranked_scores
  where score_row <= (select qualifier_counting_climbs from target)
),
qualifier_totals as (
  select
    c.id as climber_id,
    c.name,
    c.category_id,
    c.display_category,
    c.gender_division,
    c.age_group,
    coalesce(sum(cs.score), 0) as total_score,
    coalesce(count(*) filter (where cs.topped), 0) as topped_count,
    coalesce(sum(cs.attempt_count), 0) as counting_attempt_total
  from public.climbers c
  join target on target.id = c.competition_id
  left join counting_scores cs on cs.climber_id = c.id
  group by c.id, c.name, c.category_id, c.display_category, c.gender_division, c.age_group
),
ranked as (
  select
    qualifier_totals.*,
    row_number() over (
      partition by category_id
      order by total_score desc, topped_count desc, counting_attempt_total asc, name asc
    ) as category_rank
  from qualifier_totals
  where gender_division in ('Men', 'Women')
    and age_group in (
      select jsonb_array_elements_text((select finals_eligible_age_groups from target))
    )
),
cutoff as (
  select
    category_id,
    total_score,
    topped_count,
    counting_attempt_total
  from ranked
  where category_rank = (select finals_cutoff from target)
)
insert into public.competition_finalists (
  competition_id,
  climber_id,
  name,
  category_id,
  display_category,
  gender_division,
  age_group,
  qualifier_rank,
  advanced_with_tie
)
select
  target.id,
  ranked.climber_id,
  ranked.name,
  ranked.category_id,
  ranked.display_category,
  ranked.gender_division,
  ranked.age_group,
  ranked.category_rank,
  ranked.category_rank > target.finals_cutoff
from ranked
cross join target
left join cutoff using (category_id)
where ranked.category_rank <= target.finals_cutoff
   or (
     target.finals_tie_advances
     and cutoff.category_id is not null
     and ranked.category_rank > target.finals_cutoff
     and ranked.total_score = cutoff.total_score
     and ranked.topped_count = cutoff.topped_count
     and ranked.counting_attempt_total = cutoff.counting_attempt_total
   );

update public.competitions
set
  format = 'ifsc_finals_format',
  stage_mode = 'finals',
  qualifier_locked_at = now(),
  finals_started_at = now(),
  finals_problem_count = 4
where slug = 'spring-send-youth-competitive';

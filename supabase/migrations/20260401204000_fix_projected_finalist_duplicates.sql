create or replace function public.compute_finalist_selection(p_competition_id uuid)
returns table (
  climber_id uuid,
  name text,
  category_id text,
  display_category text,
  gender_division text,
  age_group text,
  qualifier_rank integer,
  advanced_with_tie boolean,
  climbing_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  with competition_row as (
    select *
    from public.competitions
    where id = p_competition_id
  ),
  ranked as (
    select *
    from public.compute_qualifier_standings(p_competition_id)
    where gender_division in ('Men', 'Women')
      and age_group in (
        select jsonb_array_elements_text((select finals_eligible_age_groups from competition_row))
      )
  ),
  cutoff as (
    select distinct on (category_id)
      category_id,
      total_score,
      topped_count,
      zone_count,
      counting_attempt_total,
      highest_counting_climb
    from ranked
    where category_rank = (select finals_cutoff from competition_row)
    order by category_id, category_rank, name
  ),
  selected as (
    select
      ranked.climber_id,
      ranked.name,
      ranked.category_id,
      ranked.display_category,
      ranked.gender_division,
      ranked.age_group,
      ranked.category_rank as qualifier_rank,
      ranked.category_rank > (select finals_cutoff from competition_row) as advanced_with_tie
    from ranked
    left join cutoff using (category_id)
    where ranked.category_rank <= (select finals_cutoff from competition_row)
       or (
         (select finals_tie_advances from competition_row)
         and (select current_phase from competition_row) <> 'qualifier_open'
         and cutoff.category_id is not null
         and ranked.category_rank > (select finals_cutoff from competition_row)
         and ranked.total_score = cutoff.total_score
         and ranked.topped_count = cutoff.topped_count
         and ranked.zone_count = cutoff.zone_count
         and ranked.counting_attempt_total = cutoff.counting_attempt_total
         and ranked.highest_counting_climb = cutoff.highest_counting_climb
       )
  )
  select
    selected.*,
    row_number() over (
      partition by selected.display_category
      order by selected.qualifier_rank desc, selected.name asc
    )::integer as climbing_order
  from selected
  order by selected.display_category, selected.qualifier_rank, selected.name;
$$;

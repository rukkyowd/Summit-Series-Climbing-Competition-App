begin;

-- Normalize the current mock event slate to the newer stage-based model
-- without deleting climbers or attempt history.

with mock_competitions as (
  select c.id, c.slug
  from public.competitions c
  where c.slug like 'mock-%'
     or c.slug in ('spring-send-recreational', 'spring-send-youth')
)
update public.competition_schedule_blocks csb
set is_active = false
from mock_competitions mc
where csb.competition_id = mc.id;

with removable_rounds as (
  select cr.id
  from public.competition_rounds cr
  join public.competitions c on c.id = cr.competition_id
  where (c.slug like 'mock-%' or c.slug in ('spring-send-recreational', 'spring-send-youth'))
    and cr.round_type = 'finals'
    and cr.scoring_bucket = 'none'
    and not exists (
      select 1
      from public.competition_schedule_blocks csb
      where csb.round_id = cr.id
    )
    and not exists (
      select 1
      from public.final_attempts fa
      where fa.round_id = cr.id
    )
    and not exists (
      select 1
      from public.qualifier_attempts qa
      where qa.round_id = cr.id
    )
)
delete from public.competition_rounds cr
using removable_rounds rr
where cr.id = rr.id;

with semifinal_targets as (
  select
    c.id as competition_id,
    c.slug,
    c.format,
    c.finals_cutoff,
    array(
      select cat.id
      from public.competition_categories cat
      where cat.competition_id = c.id
        and cat.age_group in (
          select jsonb_array_elements_text(c.finals_eligible_age_groups)
        )
      order by cat.sort_order
    ) as eligible_category_ids
  from public.competitions c
  where c.slug in ('spring-send-youth', 'mock-youth-series-live', 'mock-flash-upcoming')
)
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
select
  gen_random_uuid(),
  st.competition_id,
  2,
  2,
  'Semifinal',
  'semifinal',
  st.format,
  'pending',
  'qualifier_open',
  true,
  false,
  null,
  4,
  4,
  null,
  coalesce(st.eligible_category_ids, '{}'::text[]),
  null,
  st.finals_cutoff,
  'qualifier',
  '{}'::jsonb,
  null,
  null
from semifinal_targets st
where not exists (
  select 1
  from public.competition_rounds existing
  where existing.competition_id = st.competition_id
    and existing.round_type = 'semifinal'
);

with semifinal_blocks(slug, label, audience_label, start_time, end_time, capacity) as (
  values
    ('spring-send-youth', 'Semifinal', 'Top qualifiers', '1:00 PM', '1:30 PM', 24),
    ('mock-youth-series-live', 'Semifinal', 'Top qualifiers', '1:00 PM', '1:35 PM', 24),
    ('mock-flash-upcoming', 'Semifinal', 'Top qualifiers', '7:45 AM', '8:30 AM', 24)
)
insert into public.competition_schedule_blocks (
  id,
  competition_id,
  round_id,
  sort_order,
  label,
  phase_type,
  audience_label,
  is_active,
  start_time,
  end_time,
  capacity,
  eligible_category_ids
)
select
  gen_random_uuid(),
  c.id,
  null,
  0,
  sb.label,
  'qualifier_round',
  sb.audience_label,
  false,
  sb.start_time,
  sb.end_time,
  sb.capacity,
  coalesce(
    (
      select jsonb_agg(cat.id order by cat.sort_order)
      from public.competition_categories cat
      where cat.competition_id = c.id
        and cat.age_group in (
          select jsonb_array_elements_text(c.finals_eligible_age_groups)
        )
    ),
    '[]'::jsonb
  )
from semifinal_blocks sb
join public.competitions c on c.slug = sb.slug
where not exists (
  select 1
  from public.competition_schedule_blocks existing
  where existing.competition_id = c.id
    and existing.label = sb.label
);

with qualifier_rounds as (
  select
    c.id as competition_id,
    c.slug,
    c.format,
    c.current_phase,
    c.total_climbs,
    c.qualifier_counting_climbs,
    c.finals_cutoff,
    c.has_finals,
    c.registration_opens_at,
    c.qualifier_locked_at,
    cr.id as round_id,
    array(
      select cat.id
      from public.competition_categories cat
      where cat.competition_id = c.id
        and cat.age_group in (
          select jsonb_array_elements_text(c.qualifier_eligible_age_groups)
        )
      order by cat.sort_order
    ) as eligible_category_ids
  from public.competitions c
  join public.competition_rounds cr
    on cr.competition_id = c.id
   and cr.round_type = 'qualifier'
  where c.slug like 'mock-%'
     or c.slug in ('spring-send-recreational', 'spring-send-youth')
)
update public.competition_rounds cr
set
  round_number = 1,
  sort_order = 1,
  name = 'Qualifier',
  round_type = 'qualifier',
  format = qr.format,
  status = case
    when qr.current_phase = 'qualifier_open' then 'active'
    when qr.current_phase in ('qualifier_closed', 'wall_reset', 'observation', 'finals_open', 'finals_closed', 'results') then 'closed'
    else 'pending'
  end,
  runtime_phase = 'qualifier_open',
  is_enabled = true,
  is_active = qr.current_phase in ('qualifier_open', 'qualifier_closed', 'wall_reset'),
  activated_at = case
    when qr.current_phase in ('qualifier_open', 'qualifier_closed', 'wall_reset', 'observation', 'finals_open', 'finals_closed', 'results')
      then coalesce(cr.activated_at, qr.registration_opens_at, cr.started_at, now())
    else null
  end,
  problem_count = qr.total_climbs,
  counting_climbs = qr.qualifier_counting_climbs,
  finals_cutoff = case when qr.has_finals then qr.finals_cutoff else null end,
  eligible_category_ids = coalesce(qr.eligible_category_ids, '{}'::text[]),
  advancement_source_round_id = null,
  advancement_cutoff = case when qr.has_finals then qr.finals_cutoff else null end,
  scoring_bucket = 'qualifier',
  scoring_config = '{}'::jsonb,
  started_at = coalesce(cr.started_at, qr.registration_opens_at),
  closed_at = case
    when qr.current_phase in ('qualifier_closed', 'wall_reset', 'observation', 'finals_open', 'finals_closed', 'results')
      then coalesce(cr.closed_at, qr.qualifier_locked_at, now())
    else null
  end
from qualifier_rounds qr
where cr.id = qr.round_id;

with semifinal_rounds as (
  select
    c.id as competition_id,
    c.slug,
    c.format,
    c.current_phase,
    c.finals_cutoff,
    semi.id as round_id,
    qual.id as qualifier_round_id,
    array(
      select cat.id
      from public.competition_categories cat
      where cat.competition_id = c.id
        and cat.age_group in (
          select jsonb_array_elements_text(c.finals_eligible_age_groups)
        )
      order by cat.sort_order
    ) as eligible_category_ids
  from public.competitions c
  join public.competition_rounds semi
    on semi.competition_id = c.id
   and semi.round_type = 'semifinal'
  join public.competition_rounds qual
    on qual.competition_id = c.id
   and qual.round_type = 'qualifier'
  where c.slug in ('spring-send-youth', 'mock-youth-series-live', 'mock-flash-upcoming')
)
update public.competition_rounds cr
set
  round_number = 2,
  sort_order = 2,
  name = 'Semifinal',
  round_type = 'semifinal',
  format = sr.format,
  status = case
    when sr.current_phase in ('finals_open', 'finals_closed', 'results') then 'closed'
    else 'pending'
  end,
  runtime_phase = 'qualifier_open',
  is_enabled = true,
  is_active = false,
  activated_at = null,
  problem_count = 4,
  counting_climbs = 4,
  finals_cutoff = null,
  eligible_category_ids = coalesce(sr.eligible_category_ids, '{}'::text[]),
  advancement_source_round_id = sr.qualifier_round_id,
  advancement_cutoff = sr.finals_cutoff,
  scoring_bucket = 'qualifier',
  scoring_config = jsonb_build_object('stage_label', 'semifinal'),
  started_at = null,
  closed_at = case
    when sr.current_phase in ('finals_open', 'finals_closed', 'results') then coalesce(cr.closed_at, now())
    else null
  end
from semifinal_rounds sr
where cr.id = sr.round_id;

with finals_rounds as (
  select
    c.id as competition_id,
    c.slug,
    c.current_phase,
    c.finals_problem_count,
    c.finals_cutoff,
    c.finals_started_at,
    fr.id as round_id,
    qual.id as qualifier_round_id,
    semi.id as semifinal_round_id,
    array(
      select cat.id
      from public.competition_categories cat
      where cat.competition_id = c.id
        and cat.age_group in (
          select jsonb_array_elements_text(c.finals_eligible_age_groups)
        )
      order by cat.sort_order
    ) as eligible_category_ids
  from public.competitions c
  join public.competition_rounds fr
    on fr.competition_id = c.id
   and fr.scoring_bucket = 'finals'
  join public.competition_rounds qual
    on qual.competition_id = c.id
   and qual.round_type = 'qualifier'
  left join public.competition_rounds semi
    on semi.competition_id = c.id
   and semi.round_type = 'semifinal'
  where c.slug like 'mock-%'
     or c.slug in ('spring-send-recreational', 'spring-send-youth')
)
update public.competition_rounds cr
set
  round_number = case when fr.semifinal_round_id is null then 2 else 3 end,
  sort_order = case when fr.semifinal_round_id is null then 2 else 3 end,
  name = 'Finals',
  round_type = 'finals',
  format = 'ifsc_finals_format',
  status = case
    when fr.current_phase = 'results' then 'results'
    when fr.current_phase in ('observation', 'finals_open') then 'active'
    when fr.current_phase = 'finals_closed' then 'closed'
    else 'pending'
  end,
  runtime_phase = 'finals_open',
  is_enabled = true,
  is_active = fr.current_phase in ('observation', 'finals_open', 'finals_closed', 'results'),
  activated_at = case
    when fr.current_phase in ('observation', 'finals_open', 'finals_closed', 'results')
      then coalesce(cr.activated_at, fr.finals_started_at, now())
    else null
  end,
  problem_count = fr.finals_problem_count,
  counting_climbs = null,
  finals_cutoff = fr.finals_cutoff,
  eligible_category_ids = coalesce(fr.eligible_category_ids, '{}'::text[]),
  advancement_source_round_id = coalesce(fr.semifinal_round_id, fr.qualifier_round_id),
  advancement_cutoff = fr.finals_cutoff,
  scoring_bucket = 'finals',
  scoring_config = '{}'::jsonb,
  started_at = coalesce(cr.started_at, fr.finals_started_at),
  closed_at = case
    when fr.current_phase in ('finals_closed', 'results') then coalesce(cr.closed_at, fr.finals_started_at, now())
    else null
  end
from finals_rounds fr
where cr.id = fr.round_id;

with stage_rounds as (
  select
    c.id as competition_id,
    c.slug,
    (array_agg(cr.id order by cr.sort_order, cr.round_number) filter (where cr.round_type = 'qualifier'))[1] as qualifier_round_id,
    (array_agg(cr.id order by cr.sort_order, cr.round_number) filter (where cr.round_type = 'semifinal'))[1] as semifinal_round_id,
    (array_agg(cr.id order by cr.sort_order, cr.round_number) filter (where cr.scoring_bucket = 'finals'))[1] as finals_round_id
  from public.competitions c
  left join public.competition_rounds cr on cr.competition_id = c.id
  where c.slug like 'mock-%'
     or c.slug in ('spring-send-recreational', 'spring-send-youth')
  group by c.id, c.slug
),
block_map(slug, label, sort_order, is_active, link_stage) as (
  values
    ('spring-send-recreational', 'Check-in', 1, false, null),
    ('spring-send-recreational', 'Welcome briefing', 2, false, null),
    ('spring-send-recreational', 'Rec / Masters Session', 3, true, 'qualifier'),
    ('spring-send-recreational', 'Open Session', 4, false, 'qualifier'),
    ('spring-send-recreational', 'Score verification', 5, false, null),
    ('spring-send-recreational', 'Community awards', 6, false, null),

    ('spring-send-youth', 'Check-in', 1, false, null),
    ('spring-send-youth', 'Judges briefing', 2, false, null),
    ('spring-send-youth', 'Technical meeting', 3, false, null),
    ('spring-send-youth', 'Youth D / Youth C Wave', 4, false, 'qualifier'),
    ('spring-send-youth', 'Youth B / Youth A Wave', 5, true, 'qualifier'),
    ('spring-send-youth', 'Junior Wave', 6, false, 'qualifier'),
    ('spring-send-youth', 'Semifinal', 7, false, 'semifinal'),
    ('spring-send-youth', 'Isolation opens', 8, false, 'finals'),
    ('spring-send-youth', 'Observation', 9, false, 'finals'),
    ('spring-send-youth', 'Finals', 10, false, 'finals'),
    ('spring-send-youth', 'Awards', 11, false, null),

    ('mock-rec-scramble-live', 'Check-in', 1, false, null),
    ('mock-rec-scramble-live', 'Judges briefing', 2, false, null),
    ('mock-rec-scramble-live', 'Technical meeting', 3, false, null),
    ('mock-rec-scramble-live', 'Rec / Masters Session', 4, true, 'qualifier'),
    ('mock-rec-scramble-live', 'Open Session', 5, false, 'qualifier'),
    ('mock-rec-scramble-live', 'Score verification', 6, false, null),
    ('mock-rec-scramble-live', 'Results / Awards', 7, false, null),

    ('mock-youth-series-live', 'Check-in', 1, false, null),
    ('mock-youth-series-live', 'Judges briefing', 2, false, null),
    ('mock-youth-series-live', 'Technical meeting', 3, false, null),
    ('mock-youth-series-live', 'Youth D / Youth C Wave', 4, false, 'qualifier'),
    ('mock-youth-series-live', 'Youth B / Youth A Wave', 5, true, 'qualifier'),
    ('mock-youth-series-live', 'Junior Wave', 6, false, 'qualifier'),
    ('mock-youth-series-live', 'Semifinal', 7, false, 'semifinal'),
    ('mock-youth-series-live', 'Results review / Isolation open', 8, false, null),
    ('mock-youth-series-live', 'Isolation', 9, false, 'finals'),
    ('mock-youth-series-live', 'Observation', 10, false, 'finals'),
    ('mock-youth-series-live', 'Finals', 11, false, 'finals'),
    ('mock-youth-series-live', 'Results / Awards', 12, false, null),

    ('mock-flash-upcoming', 'Hall opens', 1, false, null),
    ('mock-flash-upcoming', 'Warm-up wall', 2, false, null),
    ('mock-flash-upcoming', 'Check-in', 3, false, null),
    ('mock-flash-upcoming', 'Technical meeting', 4, false, null),
    ('mock-flash-upcoming', 'Youth B / Youth A Rotation', 5, false, 'qualifier'),
    ('mock-flash-upcoming', 'Junior / Open Rotation', 6, false, 'qualifier'),
    ('mock-flash-upcoming', 'Semifinal', 7, false, 'semifinal'),
    ('mock-flash-upcoming', 'Isolation', 8, false, 'finals'),
    ('mock-flash-upcoming', 'Observation', 9, false, 'finals'),
    ('mock-flash-upcoming', 'Finals', 10, false, 'finals'),
    ('mock-flash-upcoming', 'Medal ceremony', 11, false, null),

    ('mock-national-finals-live', 'Check-in', 1, false, null),
    ('mock-national-finals-live', 'Technical meeting', 2, false, null),
    ('mock-national-finals-live', 'Isolation', 3, false, 'finals'),
    ('mock-national-finals-live', 'Observation', 4, false, 'finals'),
    ('mock-national-finals-live', 'Finalists presentation', 5, false, null),
    ('mock-national-finals-live', 'Finals', 6, true, 'finals'),
    ('mock-national-finals-live', 'Medal ceremony', 7, false, null),

    ('mock-city-boulder-results', 'Check-in', 1, false, null),
    ('mock-city-boulder-results', 'Technical meeting', 2, false, null),
    ('mock-city-boulder-results', 'Finalists call', 3, false, null),
    ('mock-city-boulder-results', 'Observation', 4, false, 'finals'),
    ('mock-city-boulder-results', 'Finals', 5, false, 'finals'),
    ('mock-city-boulder-results', 'Results posted', 6, true, null),

    ('mock-scramble-upcoming', 'Check-in', 1, false, null),
    ('mock-scramble-upcoming', 'Technical meeting', 2, false, null),
    ('mock-scramble-upcoming', 'Rec / Masters Session', 3, false, 'qualifier'),
    ('mock-scramble-upcoming', 'Open Session', 4, false, 'qualifier'),
    ('mock-scramble-upcoming', 'Score verification', 5, false, null),
    ('mock-scramble-upcoming', 'Awards', 6, false, null)
),
resolved_blocks as (
  select
    csb.id as block_id,
    bm.sort_order,
    bm.is_active,
    case bm.link_stage
      when 'qualifier' then sr.qualifier_round_id
      when 'semifinal' then sr.semifinal_round_id
      when 'finals' then sr.finals_round_id
      else null
    end as round_id
  from block_map bm
  join public.competitions c on c.slug = bm.slug
  join public.competition_schedule_blocks csb
    on csb.competition_id = c.id
   and csb.label = bm.label
  join stage_rounds sr on sr.competition_id = c.id
)
update public.competition_schedule_blocks csb
set
  sort_order = rb.sort_order,
  is_active = rb.is_active,
  round_id = rb.round_id
from resolved_blocks rb
where csb.id = rb.block_id;

commit;

delete from public.competition_schedule_blocks
where competition_id in (
  select id
  from public.competitions
  where slug in ('spring-send-recreational', 'spring-send-youth-competitive')
);

insert into public.competition_schedule_blocks (
  competition_id,
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
  competitions.id,
  schedule.label,
  schedule.phase_type,
  schedule.audience_label,
  schedule.is_active,
  schedule.start_time,
  schedule.end_time,
  schedule.capacity,
  '[]'::jsonb
from public.competitions competitions
join (
  values
    ('spring-send-recreational', 'Check-in - Recreational Scramble', 'check_in', 'Recreational Scramble', false, '07:45', null, 80),
    ('spring-send-recreational', 'Technical Meeting - Recreational Scramble', 'technical_meeting', 'Recreational Scramble', false, '07:50', null, 80),
    ('spring-send-recreational', 'Recreational Scramble', 'qualifier_round', 'Recreational Scramble', true, '08:00', '11:00', 80),
    ('spring-send-recreational', 'Raffle Winner Announced', 'results', 'Recreational Scramble', false, '18:45', null, 80),
    ('spring-send-youth-competitive', 'Check-in / Isolation - Youth Competitive Qualifiers', 'check_in', 'Youth Competitive Qualifiers', false, '11:20', null, 120),
    ('spring-send-youth-competitive', 'Isolation Closes', 'isolation', 'Youth Competitive Qualifiers', false, '12:00', null, 120),
    ('spring-send-youth-competitive', 'Technical Meeting - Youth Competitive Qualifiers', 'technical_meeting', 'Youth Competitive Qualifiers', false, '12:20', null, 120),
    ('spring-send-youth-competitive', 'Event - Youth Competitive Qualifiers', 'qualifier_round', 'Youth Competitive Qualifiers', true, '12:30', '16:00', 120),
    ('spring-send-youth-competitive', 'Results - Youth Competitive Qualifiers', 'results', 'Youth Competitive Qualifiers', false, '16:45', null, 120),
    ('spring-send-youth-competitive', 'Check-in / Isolation - Youth Competitive Finals', 'check_in', 'Youth Competitive Finals', false, '17:45', null, 24),
    ('spring-send-youth-competitive', 'Observation - Youth Competitive Finals', 'observation', 'Youth Competitive Finals', false, '19:00', null, 24),
    ('spring-send-youth-competitive', 'Event - Youth Competitive Finals', 'finals_round', 'Youth Competitive Finals', false, '19:15', '22:00', 24),
    ('spring-send-youth-competitive', 'Results and Prizing - Youth Competitive Finals', 'results', 'Youth Competitive Finals', false, '22:30', null, 24)
) as schedule(slug, label, phase_type, audience_label, is_active, start_time, end_time, capacity)
  on schedule.slug = competitions.slug;

insert into public.event_time_slots (
  event_id,
  label,
  phase_type,
  audience_label,
  is_active,
  start_time,
  end_time,
  capacity,
  eligible_category_ids
)
values
  (1, 'Check-in - Recreational Scramble', 'check_in', 'Recreational Scramble', false, '7:45 AM', null, 150, '[]'::jsonb),
  (1, 'Technical Meeting - Recreational Scramble', 'technical_meeting', 'Recreational Scramble', false, '7:50 AM', null, 150, '[]'::jsonb),
  (1, 'Recreational Scramble', 'qualifier_round', 'Recreational Scramble', true, '8:00 AM', '11:00 AM', 150, '[]'::jsonb),
  (1, 'Wall Strip & Reset Begins', 'wall_reset', 'Gym closes to the public', false, '11:05 AM', null, 1, '[]'::jsonb),
  (1, 'Check-in / Isolation - Youth Competitive Qualifiers', 'check_in', 'Youth Competitive Qualifiers', false, '11:20 AM', null, 110, '[]'::jsonb),
  (1, 'Isolation Closes - Youth Competitive Qualifiers', 'isolation', 'Youth Competitive Qualifiers', false, '12:00 PM', null, 110, '[]'::jsonb),
  (1, 'Technical Meeting - Youth Competitive Qualifiers', 'technical_meeting', 'Youth Competitive Qualifiers', false, '12:20 PM', null, 110, '[]'::jsonb),
  (1, 'Event - Youth Competitive Qualifiers', 'qualifier_round', 'Youth Competitive Qualifiers', false, '12:30 PM', '4:00 PM', 110, '[]'::jsonb),
  (1, 'Wall Strip & Reset Begins - Finals Reset', 'wall_reset', 'Gym closes to the public', false, '4:05 PM', null, 1, '[]'::jsonb),
  (1, 'Results - Youth Competitive Qualifiers', 'results', 'Youth Competitive Qualifiers', false, '4:45 PM', null, 110, '[]'::jsonb),
  (1, 'Check-in / Isolation - Youth Competitive Finals', 'check_in', 'Youth Competitive Finals', false, '5:45 PM', null, 20, '[]'::jsonb),
  (1, 'Isolation Closes - Youth Competitive Finals', 'isolation', 'Youth Competitive Finals', false, '6:30 PM', null, 20, '[]'::jsonb),
  (1, 'Recreational Scramble Raffle Winner Announced', 'results', 'Recreational Scramble', false, '6:45 PM', null, 150, '[]'::jsonb),
  (1, 'Observation - Youth Competitive Finals', 'observation', 'Youth Competitive Finals', false, '7:00 PM', null, 20, '[]'::jsonb),
  (1, 'Event - Youth Competitive Finals', 'finals_round', 'Youth Competitive Finals', false, '7:15 PM', '10:00 PM', 20, '[]'::jsonb),
  (1, 'Results and Prizing - Youth Competitive Finals', 'results', 'Youth Competitive Finals', false, '10:30 PM', null, 20, '[]'::jsonb);

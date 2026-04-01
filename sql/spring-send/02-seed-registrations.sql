do $$
begin
  if not exists (
    select 1
    from public.competition_schedule_blocks blocks
    join public.competitions competitions on competitions.id = blocks.competition_id
    where competitions.slug in ('spring-send-recreational', 'spring-send-youth-competitive')
  ) then
    raise exception 'Spring Send schedule blocks are missing. Run 00-reset-and-configure.sql or 01-load-schedule.sql first.';
  end if;
end $$;

with competition_map as (
  select id, slug
  from public.competitions
  where slug in ('spring-send-recreational', 'spring-send-youth-competitive')
),
slot_map as (
  select
    competition_id,
    label,
    id
  from public.competition_schedule_blocks
  where label in (
    'Check-in - Recreational Scramble',
    'Recreational Scramble',
    'Check-in / Isolation - Youth Competitive Qualifiers',
    'Event - Youth Competitive Qualifiers'
  )
),
athletes as (
  select
    series.n as athlete_number,
    case when series.n <= 48 then 'spring-send-recreational' else 'spring-send-youth-competitive' end as competition_slug,
    case ((series.n * 17) % 24)
      when 0 then 'Alex' when 1 then 'Jordan' when 2 then 'Taylor'
      when 3 then 'Morgan' when 4 then 'Riley' when 5 then 'Casey'
      when 6 then 'Skyler' when 7 then 'Avery' when 8 then 'Quinn'
      when 9 then 'Parker' when 10 then 'Jamie' when 11 then 'Drew'
      when 12 then 'Reese' when 13 then 'Cameron' when 14 then 'Blake'
      when 15 then 'Logan' when 16 then 'Rowan' when 17 then 'Harper'
      when 18 then 'Sage' when 19 then 'Finley' when 20 then 'Noah'
      when 21 then 'Micah' when 22 then 'Elliot' else 'Phoenix'
    end || ' ' ||
    case ((series.n * 19) % 24)
      when 0 then 'Stone' when 1 then 'Reid' when 2 then 'Cruz'
      when 3 then 'Chen' when 4 then 'Roy' when 5 then 'Sato'
      when 6 then 'Lopez' when 7 then 'Singh' when 8 then 'Bennett'
      when 9 then 'Nguyen' when 10 then 'Martin' when 11 then 'Campbell'
      when 12 then 'Tremblay' when 13 then 'Wong' when 14 then 'Patel'
      when 15 then 'MacDonald' when 16 then 'Fraser' when 17 then 'Young'
      when 18 then 'Carter' when 19 then 'Bouchard' when 20 then 'Khan'
      when 21 then 'Morrison' when 22 then 'LeBlanc' else 'Mitchell'
    end || ' ' || series.n as athlete_name,
    case ((series.n * 23) % 13)
      when 0 then 'AB' when 1 then 'BC' when 2 then 'MB'
      when 3 then 'NB' when 4 then 'NL' when 5 then 'NS'
      when 6 then 'NT' when 7 then 'NU' when 8 then 'ON'
      when 9 then 'PE' when 10 then 'QC' when 11 then 'SK' else 'YT'
    end as province,
    case
      when series.n <= 48 then
        (array['Rec', 'Rec', 'Rec', 'Open', 'Masters', 'Rec', 'Open', 'Masters'])[((series.n * 5) % 8) + 1]
      else
        (array['Youth D', 'Youth C', 'Youth B', 'Youth A', 'Junior', 'Youth B', 'Youth A', 'Junior'])[((series.n * 7) % 8) + 1]
    end as age_group,
    case
      when series.n <= 48 then
        (array['Men', 'Women', 'X', 'Women', 'Men', 'X'])[((series.n * 11) % 6) + 1]
      else
        (array['Men', 'Women', 'Men', 'Women', 'Men', 'Women', 'X'])[((series.n * 13) % 7) + 1]
    end as gender_division,
    case
      when series.n <= 48 and (series.n % 3) = 0 then 'Check-in - Recreational Scramble'
      when series.n <= 48 then 'Recreational Scramble'
      when (series.n % 4) in (0, 1) then 'Check-in / Isolation - Youth Competitive Qualifiers'
      else 'Event - Youth Competitive Qualifiers'
    end as slot_label
  from generate_series(1, 124) as series(n)
)
insert into public.climbers (
  competition_id,
  name,
  climber_number,
  province,
  category_id,
  gender_division,
  age_group,
  display_category,
  time_slot_id,
  access_token
)
select
  competition_map.id,
  athletes.athlete_name,
  lpad(athletes.athlete_number::text, 3, '0'),
  athletes.province,
  athletes.gender_division || '::' || athletes.age_group,
  athletes.gender_division,
  athletes.age_group,
  athletes.gender_division || ' / ' || athletes.age_group,
  slot_map.id,
  athletes.competition_slug || '-token-' || lpad(athletes.athlete_number::text, 3, '0')
from athletes
join competition_map on competition_map.slug = athletes.competition_slug
left join slot_map
  on slot_map.competition_id = competition_map.id
 and slot_map.label = athletes.slot_label;

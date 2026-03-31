with division_seed as (
  select *
  from (values ('Men'), ('Women'), ('X')) as divisions(gender_division)
),
age_seed as (
  select *
  from (
    values
      ('Youth D'),
      ('Youth C'),
      ('Youth B'),
      ('Youth A'),
      ('Junior'),
      ('Rec'),
      ('Masters'),
      ('Open')
  ) as ages(age_group)
),
category_grid as (
  select
    row_number() over (order by d.gender_division, a.age_group) as category_index,
    d.gender_division,
    a.age_group,
    d.gender_division || ' / ' || a.age_group as display_category
  from division_seed d
  cross join age_seed a
),
athlete_seed as (
  select
    athlete_number,
    case ((athlete_number * 13) % 15)
      when 0 then 'Alex' when 1 then 'Jordan' when 2 then 'Taylor'
      when 3 then 'Morgan' when 4 then 'Riley' when 5 then 'Casey'
      when 6 then 'Skyler' when 7 then 'Avery' when 8 then 'Quinn'
      when 9 then 'Parker' when 10 then 'Jamie' when 11 then 'Drew'
      when 12 then 'Reese' when 13 then 'Cameron' else 'Blake'
    end || ' ' ||
    case ((athlete_number * 17) % 16)
      when 0 then 'Stone' when 1 then 'Reid' when 2 then 'Cruz'
      when 3 then 'Chen' when 4 then 'Roy' when 5 then 'Sato'
      when 6 then 'Lopez' when 7 then 'Singh' when 8 then 'Bennett'
      when 9 then 'Nguyen' when 10 then 'Smith' when 11 then 'Tremblay'
      when 12 then 'Martin' when 13 then 'Wong' when 14 then 'Campbell' else 'Mitchell'
    end || ' ' || athlete_number as athlete_name,
    case ((athlete_number * 19) % 13)
      when 0 then 'AB' when 1 then 'BC' when 2 then 'MB'
      when 3 then 'NB' when 4 then 'NL' when 5 then 'NS'
      when 6 then 'NT' when 7 then 'NU' when 8 then 'ON'
      when 9 then 'PE' when 10 then 'QC' when 11 then 'SK' else 'YT'
    end as province,
    ((athlete_number - 1) % 24) + 1 as category_index
  from generate_series(1, 100) as athlete_number
),
athlete_with_category as (
  select
    athlete_seed.*,
    category_grid.gender_division,
    category_grid.age_group,
    category_grid.display_category,
    case
      when category_grid.age_group = 'Rec' then 'Check-in - Recreational Scramble'
      else 'Check-in / Isolation - Youth Competitive Qualifiers'
    end as slot_label
  from athlete_seed
  join category_grid on category_grid.category_index = athlete_seed.category_index
)
insert into public.climbers (
  event_id,
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
  1,
  athlete_with_category.athlete_name,
  lpad(athlete_with_category.athlete_number::text, 3, '0'),
  athlete_with_category.province,
  null,
  athlete_with_category.gender_division,
  athlete_with_category.age_group,
  athlete_with_category.display_category,
  slots.id,
  'spring-send-link-' || lpad(athlete_with_category.athlete_number::text, 3, '0')
from athlete_with_category
join public.event_time_slots slots on slots.label = athlete_with_category.slot_label
where slots.event_id = 1;

with competition_map as (
  select id, slug
  from public.competitions
  where slug in ('spring-send-recreational', 'spring-send-youth-competitive')
),
athletes as (
  select
    series.n as athlete_number,
    case when series.n <= 40 then 'spring-send-recreational' else 'spring-send-youth-competitive' end as competition_slug,
    case ((series.n * 7) % 15)
      when 0 then 'Alex' when 1 then 'Jordan' when 2 then 'Taylor'
      when 3 then 'Morgan' when 4 then 'Riley' when 5 then 'Casey'
      when 6 then 'Skyler' when 7 then 'Avery' when 8 then 'Quinn'
      when 9 then 'Parker' when 10 then 'Jamie' when 11 then 'Drew'
      when 12 then 'Reese' when 13 then 'Cameron' else 'Blake'
    end || ' ' ||
    case ((series.n * 11) % 10)
      when 0 then 'Stone' when 1 then 'Reid' when 2 then 'Cruz'
      when 3 then 'Chen' when 4 then 'Roy' when 5 then 'Sato'
      when 6 then 'Lopez' when 7 then 'Singh' when 8 then 'Bennett'
      else 'Nguyen'
    end || ' ' || series.n as athlete_name,
    case ((series.n * 13) % 13)
      when 0 then 'AB' when 1 then 'BC' when 2 then 'MB'
      when 3 then 'NB' when 4 then 'NL' when 5 then 'NS'
      when 6 then 'NT' when 7 then 'NU' when 8 then 'ON'
      when 9 then 'PE' when 10 then 'QC' when 11 then 'SK' else 'YT'
    end as province,
    case when series.n <= 40 then 'Rec' else
      (array['Youth D','Youth C','Youth B','Youth A','Junior'])[((series.n % 5) + 1)]
    end as age_group,
    case when (series.n % 2) = 0 then 'Men' else 'Women' end as gender_division
  from generate_series(1, 100) as series(n)
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
  athletes.competition_slug || '-token-' || lpad(athletes.athlete_number::text, 3, '0')
from athletes
join competition_map on competition_map.slug = athletes.competition_slug;

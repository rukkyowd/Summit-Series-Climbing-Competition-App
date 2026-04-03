begin;

do $$
begin
  if not exists (
    select 1
    from public.competitions
    where slug = 'spring-send-youth'
  ) then
    raise exception 'Missing spring-send-youth competition. Run sql/mock-events-seed.sql first.';
  end if;
end $$;

delete from public.qualifier_attempts
where competition_id = (
  select id
  from public.competitions
  where slug = 'spring-send-youth'
  limit 1
);

with scored_event as (
  select id, slug, format, total_climbs
  from public.competitions
  where slug = 'spring-send-youth'
),
attempt_source as (
  select
    c.competition_id,
    c.id as climber_id,
    se.slug,
    se.format,
    gs.climb_number,
    get_byte(decode(md5(c.id::text || ':' || gs.climb_number::text || ':a'), 'hex'), 0) as seed_a,
    get_byte(decode(md5(c.id::text || ':' || gs.climb_number::text || ':b'), 'hex'), 0) as seed_b,
    get_byte(decode(md5(c.id::text || ':' || gs.climb_number::text || ':c'), 'hex'), 0) as seed_c,
    get_byte(decode(md5(c.id::text || ':' || gs.climb_number::text || ':d'), 'hex'), 0) as seed_d
  from public.climbers c
  join scored_event se
    on se.id = c.competition_id
  cross join lateral generate_series(1, se.total_climbs) as gs(climb_number)
),
attempt_outcomes as (
  select
    competition_id,
    climber_id,
    climb_number,
    slug,
    format,
    seed_a < 90 as attempted,
    seed_b < case
      when climb_number <= 5 then 34
      when climb_number <= 10 then 24
      when climb_number <= 14 then 16
      else 10
    end as topped_raw,
    seed_c < case
      when climb_number <= 5 then 78
      when climb_number <= 10 then 62
      when climb_number <= 14 then 48
      else 34
    end as zone_raw,
    1 + (seed_b % 3) as top_tries,
    1 + (seed_c % 4) as zone_tries,
    1 + (seed_d % 5) as generic_tries
  from attempt_source
),
materialized_attempts as (
  select
    competition_id,
    climber_id,
    climb_number,
    (topped_raw or zone_raw) as zone,
    topped_raw as topped,
    case
      when topped_raw then top_tries
      when zone_raw then zone_tries
      else generic_tries
    end as attempt_count,
    case when topped_raw then top_tries end as attempts_to_top,
    case
      when topped_raw then top_tries
      when zone_raw then zone_tries
      else null
    end as attempts_to_zone,
    'staff' as entered_by
  from attempt_outcomes
  where attempted
)
insert into public.qualifier_attempts (
  competition_id,
  climber_id,
  climb_number,
  attempt_count,
  zone,
  topped,
  attempts_to_top,
  attempts_to_zone,
  entered_by
)
select
  competition_id,
  climber_id,
  climb_number,
  attempt_count,
  zone,
  topped,
  attempts_to_top,
  attempts_to_zone,
  entered_by
from materialized_attempts;

commit;

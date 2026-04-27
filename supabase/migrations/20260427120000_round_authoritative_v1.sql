alter table public.competition_schedule_blocks
add column if not exists round_id uuid references public.competition_rounds(id) on delete set null;

alter table public.competition_rounds
add column if not exists sort_order integer;

alter table public.competition_rounds
add column if not exists runtime_phase text;

alter table public.competition_rounds
add column if not exists is_enabled boolean not null default true;

alter table public.competition_rounds
add column if not exists is_active boolean not null default false;

alter table public.competition_rounds
add column if not exists activated_at timestamptz;

alter table public.competition_rounds
add column if not exists eligible_category_ids uuid[] not null default '{}'::uuid[];

alter table public.competition_rounds
add column if not exists advancement_source_round_id uuid references public.competition_rounds(id) on delete set null;

alter table public.competition_rounds
add column if not exists advancement_cutoff integer;

alter table public.competition_rounds
add column if not exists scoring_bucket text not null default 'none';

alter table public.competition_rounds
add column if not exists scoring_config jsonb not null default '{}'::jsonb;

update public.competition_rounds
set
  sort_order = coalesce(sort_order, round_number),
  runtime_phase = coalesce(
    runtime_phase,
    case round_type
      when 'qualifier' then 'qualifier_open'
      when 'finals' then 'finals_open'
      else 'wall_reset'
    end
  ),
  activated_at = coalesce(activated_at, started_at),
  advancement_cutoff = coalesce(advancement_cutoff, finals_cutoff),
  scoring_bucket = case
    when scoring_bucket in ('none', 'qualifier', 'finals') then scoring_bucket
    when round_type = 'qualifier' then 'qualifier'
    when round_type = 'finals' then 'finals'
    else 'none'
  end,
  scoring_config = coalesce(scoring_config, '{}'::jsonb);

insert into public.competition_rounds (
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
  c.id,
  1,
  1,
  'Qualifier',
  'qualifier',
  c.format,
  case
    when c.current_phase = 'qualifier_open' then 'active'
    when c.current_phase in ('qualifier_closed', 'wall_reset', 'observation', 'finals_open', 'finals_closed', 'results') then 'closed'
    else 'pending'
  end,
  'qualifier_open',
  true,
  public.phase_to_stage_mode(c.current_phase) = 'qualifier',
  case when c.current_phase = 'qualifier_open' then coalesce(c.registration_opens_at, now()) else null end,
  c.total_climbs,
  c.qualifier_counting_climbs,
  case when c.has_finals then c.finals_cutoff else null end,
  '{}'::uuid[],
  null,
  case when c.has_finals then c.finals_cutoff else null end,
  'qualifier',
  '{}'::jsonb,
  case when c.current_phase = 'qualifier_open' then c.registration_opens_at else null end,
  case when c.current_phase = 'qualifier_open' then null else c.qualifier_locked_at end
from public.competitions c
where not exists (
  select 1
  from public.competition_rounds cr
  where cr.competition_id = c.id
    and cr.scoring_bucket = 'qualifier'
)
on conflict (competition_id, round_number)
do update set
  sort_order = excluded.sort_order,
  name = excluded.name,
  round_type = excluded.round_type,
  format = excluded.format,
  status = excluded.status,
  runtime_phase = excluded.runtime_phase,
  is_enabled = excluded.is_enabled,
  is_active = excluded.is_active,
  activated_at = excluded.activated_at,
  problem_count = excluded.problem_count,
  counting_climbs = excluded.counting_climbs,
  finals_cutoff = excluded.finals_cutoff,
  advancement_cutoff = excluded.advancement_cutoff,
  scoring_bucket = excluded.scoring_bucket,
  scoring_config = excluded.scoring_config,
  started_at = excluded.started_at,
  closed_at = excluded.closed_at;

insert into public.competition_rounds (
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
  c.id,
  coalesce((select max(cr.round_number) from public.competition_rounds cr where cr.competition_id = c.id), 1) + 1,
  coalesce((select max(cr.sort_order) from public.competition_rounds cr where cr.competition_id = c.id), 1) + 1,
  'Finals',
  'finals',
  'ifsc_finals_format',
  case
    when c.current_phase = 'observation' then 'scoring'
    when c.current_phase = 'finals_open' then 'active'
    when c.current_phase = 'finals_closed' then 'closed'
    when c.current_phase = 'results' then 'results'
    else 'pending'
  end,
  'finals_open',
  true,
  public.phase_to_stage_mode(c.current_phase) = 'finals',
  case when public.phase_to_stage_mode(c.current_phase) = 'finals' then coalesce(c.finals_started_at, now()) else null end,
  c.finals_problem_count,
  null,
  c.finals_cutoff,
  '{}'::uuid[],
  (
    select cr.id
    from public.competition_rounds cr
    where cr.competition_id = c.id
      and cr.scoring_bucket = 'qualifier'
    order by cr.sort_order, cr.round_number
    limit 1
  ),
  c.finals_cutoff,
  'finals',
  '{}'::jsonb,
  c.finals_started_at,
  case when c.current_phase in ('finals_closed', 'results') then now() else null end
from public.competitions c
where c.has_finals
  and not exists (
    select 1
    from public.competition_rounds cr
    where cr.competition_id = c.id
      and cr.scoring_bucket = 'finals'
  )
on conflict (competition_id, round_number)
do update set
  sort_order = excluded.sort_order,
  name = excluded.name,
  round_type = excluded.round_type,
  format = excluded.format,
  status = excluded.status,
  runtime_phase = excluded.runtime_phase,
  is_enabled = excluded.is_enabled,
  is_active = excluded.is_active,
  activated_at = excluded.activated_at,
  problem_count = excluded.problem_count,
  counting_climbs = excluded.counting_climbs,
  finals_cutoff = excluded.finals_cutoff,
  advancement_source_round_id = excluded.advancement_source_round_id,
  advancement_cutoff = excluded.advancement_cutoff,
  scoring_bucket = excluded.scoring_bucket,
  scoring_config = excluded.scoring_config,
  started_at = excluded.started_at,
  closed_at = excluded.closed_at;

update public.competition_rounds finals_round
set advancement_source_round_id = qualifier_round.id
from public.competition_rounds qualifier_round
where finals_round.competition_id = qualifier_round.competition_id
  and finals_round.scoring_bucket = 'finals'
  and qualifier_round.scoring_bucket = 'qualifier'
  and finals_round.advancement_source_round_id is null;

update public.competition_schedule_blocks block
set round_id = qualifier_round.id
from public.competition_rounds qualifier_round
where block.competition_id = qualifier_round.competition_id
  and qualifier_round.scoring_bucket = 'qualifier'
  and block.phase_type = 'qualifier_round'
  and block.round_id is null;

update public.competition_schedule_blocks block
set round_id = finals_round.id
from public.competition_rounds finals_round
where block.competition_id = finals_round.competition_id
  and finals_round.scoring_bucket = 'finals'
  and block.phase_type in ('isolation', 'observation', 'finals_round')
  and block.round_id is null;

alter table public.competition_rounds
alter column sort_order set not null;

alter table public.competition_rounds
alter column runtime_phase set not null;

alter table public.competition_rounds
drop constraint if exists competition_rounds_scoring_bucket_check;

alter table public.competition_rounds
add constraint competition_rounds_scoring_bucket_check
check (scoring_bucket in ('none', 'qualifier', 'finals'));

alter table public.competition_rounds
drop constraint if exists competition_rounds_scoring_bucket_type_check;

alter table public.competition_rounds
add constraint competition_rounds_scoring_bucket_type_check
check (
  (round_type = 'qualifier' and scoring_bucket in ('none', 'qualifier'))
  or (round_type = 'finals' and scoring_bucket in ('none', 'finals'))
  or (round_type = 'semifinal' and scoring_bucket = 'none')
);

create unique index if not exists competition_rounds_one_active_idx
on public.competition_rounds (competition_id)
where is_active;

create unique index if not exists competition_rounds_one_qualifier_bucket_idx
on public.competition_rounds (competition_id)
where scoring_bucket = 'qualifier';

create unique index if not exists competition_rounds_one_finals_bucket_idx
on public.competition_rounds (competition_id)
where scoring_bucket = 'finals';

create index if not exists competition_schedule_blocks_round_idx
on public.competition_schedule_blocks (competition_id, round_id);

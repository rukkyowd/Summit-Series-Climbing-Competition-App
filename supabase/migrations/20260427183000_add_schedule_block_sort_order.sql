alter table public.competition_schedule_blocks
add column if not exists sort_order integer;

with ranked_blocks as (
  select
    id,
    row_number() over (
      partition by competition_id
      order by
        case when is_active then 0 else 1 end,
        created_at,
        label,
        id
    ) - 1 as next_sort_order
  from public.competition_schedule_blocks
)
update public.competition_schedule_blocks blocks
set sort_order = ranked_blocks.next_sort_order
from ranked_blocks
where blocks.id = ranked_blocks.id
  and blocks.sort_order is null;

alter table public.competition_schedule_blocks
alter column sort_order set default 0;

update public.competition_schedule_blocks
set sort_order = 0
where sort_order is null;

alter table public.competition_schedule_blocks
alter column sort_order set not null;

create index if not exists competition_schedule_blocks_competition_id_sort_order_idx
on public.competition_schedule_blocks (competition_id, sort_order);

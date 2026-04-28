alter table public.competitions
add column if not exists is_demo boolean not null default false;

create index if not exists competitions_is_demo_idx
on public.competitions (is_demo, slug);

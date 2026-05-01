alter table public.competitions
add column if not exists demo_metadata jsonb not null default '{}'::jsonb;

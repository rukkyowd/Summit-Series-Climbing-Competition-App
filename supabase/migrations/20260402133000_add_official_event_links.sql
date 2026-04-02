alter table public.competitions
  add column if not exists official_event_url text not null default '',
  add column if not exists official_registration_url text not null default '',
  add column if not exists official_schedule_url text not null default '';

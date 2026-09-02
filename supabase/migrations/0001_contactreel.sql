-- ContactReel portable Supabase/Postgres schema.
-- The current single-process worker can run without these tables, but this
-- migration is the durable persistence boundary for multi-replica deployments.

create extension if not exists pgcrypto;

create table if not exists public.contactreel_sources (
  id text primary key,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.contactreel_source_images (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.contactreel_sources(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  storage_path text not null,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (source_id, storage_path),
  unique (source_id, sort_order)
);

create index if not exists contactreel_source_images_source_idx
  on public.contactreel_source_images (source_id, sort_order);

create table if not exists public.contactreel_render_jobs (
  job_id text primary key check (job_id ~ '^cr_[A-Za-z0-9_-]+$'),
  source_id text not null,
  status text not null check (status in ('queued', 'rendering', 'completed', 'failed', 'cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  stage text not null default 'Queued',
  seed integer not null check (seed between 0 and 2147483647),
  input jsonb not null,
  output jsonb,
  error jsonb,
  idempotency_key text unique,
  callback_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contactreel_render_jobs_status_idx
  on public.contactreel_render_jobs (status, created_at);

create index if not exists contactreel_render_jobs_source_idx
  on public.contactreel_render_jobs (source_id, created_at desc);

create or replace function public.contactreel_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contactreel_render_jobs_touch_updated_at
  on public.contactreel_render_jobs;

create trigger contactreel_render_jobs_touch_updated_at
before update on public.contactreel_render_jobs
for each row execute function public.contactreel_touch_updated_at();

-- Private buckets. The service role bypasses RLS and is the only application
-- principal expected to access these objects.
insert into storage.buckets (id, name, public)
values
  ('reel-images', 'reel-images', false),
  ('reel-renders', 'reel-renders', false)
on conflict (id) do update set public = false;

alter table public.contactreel_sources enable row level security;
alter table public.contactreel_source_images enable row level security;
alter table public.contactreel_render_jobs enable row level security;

drop policy if exists contactreel_sources_service_role on public.contactreel_sources;
create policy contactreel_sources_service_role
  on public.contactreel_sources for all to service_role
  using (true) with check (true);

drop policy if exists contactreel_source_images_service_role on public.contactreel_source_images;
create policy contactreel_source_images_service_role
  on public.contactreel_source_images for all to service_role
  using (true) with check (true);

drop policy if exists contactreel_render_jobs_service_role on public.contactreel_render_jobs;
create policy contactreel_render_jobs_service_role
  on public.contactreel_render_jobs for all to service_role
  using (true) with check (true);

drop policy if exists contactreel_storage_service_role on storage.objects;
create policy contactreel_storage_service_role
  on storage.objects for all to service_role
  using (bucket_id in ('reel-images', 'reel-renders'))
  with check (bucket_id in ('reel-images', 'reel-renders'));
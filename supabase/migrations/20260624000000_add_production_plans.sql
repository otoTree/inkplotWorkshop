-- Production plans for scheduled storyboard prompt and video generation.

create table if not exists production_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  title text not null,
  status text not null default 'active',
  mode text not null default 'storyboard_then_video',
  schedule_type text not null default 'manual',
  interval_minutes integer,
  timezone text default 'Asia/Shanghai',
  next_run_at timestamp with time zone,
  last_run_at timestamp with time zone,
  config jsonb not null default '{}'::jsonb,
  cursor jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists production_jobs (
  id uuid default gen_random_uuid() primary key,
  plan_id uuid references production_plans(id) on delete cascade,
  user_id uuid references auth.users on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  episode_id uuid references episodes(id) on delete cascade,
  type text not null,
  status text not null default 'pending',
  scheduled_at timestamp with time zone default timezone('utc'::text, now()) not null,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  locked_at timestamp with time zone,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists cron_locks (
  name text primary key,
  locked_until timestamp with time zone not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists production_plans_project_id_idx on production_plans(project_id);
create index if not exists production_plans_due_idx on production_plans(status, next_run_at);
create index if not exists production_jobs_plan_id_idx on production_jobs(plan_id);
create index if not exists production_jobs_status_idx on production_jobs(status, scheduled_at);
create index if not exists production_jobs_episode_idx on production_jobs(episode_id, type, status);

alter table production_plans enable row level security;
alter table production_jobs enable row level security;
alter table cron_locks enable row level security;

drop policy if exists "Users can CRUD their own production plans" on production_plans;
create policy "Users can CRUD their own production plans"
  on production_plans for all
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own production jobs" on production_jobs;
create policy "Users can view their own production jobs"
  on production_jobs for select
  using (auth.uid() = user_id);

create or replace function public.try_acquire_cron_lock(lock_name text, lock_for_seconds integer)
returns boolean as $$
declare
  did_lock boolean;
begin
  insert into public.cron_locks(name, locked_until, updated_at)
  values (
    lock_name,
    timezone('utc'::text, now()) + make_interval(secs => lock_for_seconds),
    timezone('utc'::text, now())
  )
  on conflict (name) do update
    set locked_until = timezone('utc'::text, now()) + make_interval(secs => lock_for_seconds),
        updated_at = timezone('utc'::text, now())
    where public.cron_locks.locked_until < timezone('utc'::text, now());

  get diagnostics did_lock = row_count;
  return did_lock;
end;
$$ language plpgsql security definer;

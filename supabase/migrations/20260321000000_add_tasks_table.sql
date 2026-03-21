-- Create tasks table for task queue management
create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade,
  type text not null,
  status text not null default 'pending',
  payload jsonb,
  result jsonb,
  error text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table tasks enable row level security;

-- Users can CRUD their own tasks
create policy "Users can CRUD their own tasks"
  on tasks for all
  using (auth.uid() = user_id);


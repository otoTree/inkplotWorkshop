-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Create Profiles Table (Optional but recommended)
create table profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  avatar_url text,
  full_name text,
  updated_at timestamp with time zone
);

alter table profiles enable row level security;

create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

-- 2. Create Projects Table
create table projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  logline text,
  genre text[],
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table projects enable row level security;

create policy "Users can CRUD their own projects"
  on projects for all
  using (auth.uid() = user_id);

-- 3. Create Episodes Table
create table episodes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  episode_number integer not null,
  title text,
  content text,
  structure jsonb,
  last_edited timestamp with time zone default timezone('utc'::text, now()) not null
);

create index episodes_project_id_idx on episodes(project_id);

alter table episodes enable row level security;

create policy "Users can CRUD their own episodes"
  on episodes for all
  using (auth.uid() = user_id);

-- 4. Create Assets Table
create type asset_type as enum ('character', 'location', 'prop');
create type asset_status as enum ('draft', 'locked');

create table assets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  type asset_type not null,
  name text not null,
  description text,
  visual_prompt text,
  image_url text,
  status asset_status default 'draft',
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table assets enable row level security;

create policy "Users can CRUD their own assets"
  on assets for all
  using (auth.uid() = user_id);

-- 5. Create Shots Table
create table shots (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  episode_id uuid references episodes(id) on delete cascade not null,
  sequence_number integer not null,
  narrative_goal text,
  visual_evidence text,
  description text,
  dialogue text,
  camera text,
  size text,
  duration integer,
  related_asset_ids uuid[],
  
  -- ★NEW: Industrial-grade storyboard fields
  scene_label text,
  character_action text,
  emotion text,
  lighting_atmosphere text,
  sound_effect text,
  reference_image text,
  video_prompt text,
  characters jsonb, -- Array of { name, description, imageUrl }
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table shots enable row level security;

create policy "Users can CRUD their own shots"
  on shots for all
  using (auth.uid() = user_id);

-- 6. Create Trigger to handle new user signup (Optional)
-- Automatically create a profile entry when a new user signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

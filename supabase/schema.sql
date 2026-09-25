-- =====================================================================
-- Vaibhav Web Studio: database schema for Supabase
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to re-run: objects are created only if missing.
-- =====================================================================

-- ---------- Project status ----------
do $$ begin
  create type public.project_status as enum (
    'Requirement Submitted', 'Under Review', 'Planning', 'Design',
    'Development', 'Testing', 'Ready for Launch', 'Live'
  );
exception when duplicate_object then null; end $$;

-- ---------- Profiles (one per auth user) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (char_length(full_name) <= 80),
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Create a profile automatically when someone signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Projects ----------
create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 100),
  website_type  text not null check (char_length(website_type) between 1 and 80),
  budget        text check (char_length(budget) <= 60),
  timeline      text check (char_length(timeline) <= 60),
  requirements  jsonb not null check (pg_column_size(requirements) < 60000),
  status        public.project_status not null default 'Requirement Submitted',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists projects_user_id_idx on public.projects (user_id, created_at desc);
alter table public.projects enable row level security;

drop policy if exists "projects: read own" on public.projects;
create policy "projects: read own" on public.projects
  for select to authenticated using (user_id = (select auth.uid()));

-- Clients can create their own projects, but only with the initial status.
-- Status changes are made by the site owner in the Supabase dashboard.
drop policy if exists "projects: create own" on public.projects;
create policy "projects: create own" on public.projects
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'Requirement Submitted');

-- Server-side rate limit: max 5 new projects per user per 24 hours
create or replace function public.limit_project_inserts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.projects
      where user_id = new.user_id and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists projects_rate_limit on public.projects;
create trigger projects_rate_limit before insert on public.projects
  for each row execute function public.limit_project_inserts();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- ---------- Project updates (written by the owner, read by the client) ----------
create table if not exists public.project_updates (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  message     text not null check (char_length(message) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists project_updates_project_idx on public.project_updates (project_id, created_at desc);
alter table public.project_updates enable row level security;

drop policy if exists "updates: read own projects" on public.project_updates;
create policy "updates: read own projects" on public.project_updates
  for select to authenticated using (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid()))
  );

-- ---------- Contact messages (write-only for visitors) ----------
create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  email       text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  phone       text check (char_length(phone) <= 20),
  subject     text not null check (char_length(subject) <= 80),
  message     text not null check (char_length(message) between 15 and 3000),
  created_at  timestamptz not null default now()
);
alter table public.contact_messages enable row level security;

drop policy if exists "contact: anyone can send" on public.contact_messages;
create policy "contact: anyone can send" on public.contact_messages
  for insert to anon, authenticated with check (true);
-- No select/update/delete policies: messages are readable only in the Supabase dashboard.

-- Server-side rate limit: 3 per email per hour, 30 site-wide per 10 minutes
create or replace function public.limit_contact_inserts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.contact_messages
      where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.contact_messages
      where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists contact_rate_limit on public.contact_messages;
create trigger contact_rate_limit before insert on public.contact_messages
  for each row execute function public.limit_contact_inserts();

-- ---------- Privileges ----------
revoke all on public.projects, public.project_updates, public.contact_messages, public.profiles from anon;
grant insert on public.contact_messages to anon;
grant select, insert on public.projects to authenticated;
grant select on public.project_updates to authenticated;
grant insert on public.contact_messages to authenticated;
grant select, update (full_name) on public.profiles to authenticated;

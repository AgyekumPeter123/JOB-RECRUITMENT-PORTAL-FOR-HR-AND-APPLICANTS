create extension if not exists "pgcrypto";

insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('profile-pictures', 'profile-pictures', true)
on conflict (id) do update set public = excluded.public;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('hr', 'applicant')),
  full_name text not null,
  phone text,
  department text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_posts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.user_profiles(id) on delete cascade,
  title text not null,
  department text,
  location text,
  employment_type text not null default 'Full-time',
  description text not null,
  status text not null default 'open' check (status in ('open', 'closed', 'draft')),
  salary_min numeric(12,2),
  salary_max numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.user_profiles(id) on delete cascade,
  job_post_id uuid not null references public.job_posts(id) on delete cascade,
  cover_letter text,
  cv_url text,
  profile_picture_url text,
  status text not null default 'received' check (status in ('received', 'shortlisted', 'interviewing', 'offer', 'hired', 'rejected', 'onboarding')),
  interview_at text,
  salary_offered numeric(12,2),
  hr_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete set null,
  job_application_id uuid unique references public.job_applications(id) on delete set null,
  employee_code text unique not null,
  full_name text not null,
  department text,
  job_title text not null,
  employment_status text not null default 'active' check (employment_status in ('active', 'onboarding', 'suspended', 'terminated', 'resigned')),
  salary numeric(12,2) not null default 0,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_profiles(id) on delete cascade,
  job_application_id uuid references public.job_applications(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  channel text not null default 'dashboard' check (channel in ('dashboard')),
  type text not null,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.application_events (
  id uuid primary key default gen_random_uuid(),
  job_application_id uuid not null references public.job_applications(id) on delete cascade,
  actor_id uuid references public.user_profiles(id) on delete set null,
  stage text not null,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists job_posts_status_idx on public.job_posts (status);
create index if not exists job_applications_status_idx on public.job_applications (status);
create index if not exists job_applications_applicant_idx on public.job_applications (applicant_id);
create index if not exists job_applications_job_idx on public.job_applications (job_post_id);
create index if not exists notifications_user_idx on public.notifications (user_id, is_read);
create index if not exists application_events_job_idx on public.application_events (job_application_id, created_at desc);

alter table public.user_profiles enable row level security;
alter table public.job_posts enable row level security;
alter table public.job_applications enable row level security;
alter table public.employees enable row level security;
alter table public.notifications enable row level security;
alter table public.application_events enable row level security;

drop policy if exists "profiles self select" on public.user_profiles;
create policy "profiles self select" on public.user_profiles
  for select using (auth.uid() = id or exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'));

drop policy if exists "profiles self insert" on public.user_profiles;
create policy "profiles self insert" on public.user_profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles self update" on public.user_profiles;
create policy "profiles self update" on public.user_profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "jobs public read" on public.job_posts;
create policy "jobs public read" on public.job_posts
  for select using (status = 'open' or exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'));

drop policy if exists "jobs hr insert" on public.job_posts;
create policy "jobs hr insert" on public.job_posts
  for insert with check (exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'));

drop policy if exists "jobs hr update" on public.job_posts;
create policy "jobs hr update" on public.job_posts
  for update using (exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'))
  with check (exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'));

drop policy if exists "jobs hr delete" on public.job_posts;
create policy "jobs hr delete" on public.job_posts
  for delete using (exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'));

drop policy if exists "applications applicant read own or hr all" on public.job_applications;
create policy "applications applicant read own or hr all" on public.job_applications
  for select using (applicant_id = auth.uid() or exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'));

drop policy if exists "applications applicant insert own" on public.job_applications;
create policy "applications applicant insert own" on public.job_applications
  for insert with check (applicant_id = auth.uid());

drop policy if exists "applications applicant update own or hr all" on public.job_applications;
create policy "applications applicant update own or hr all" on public.job_applications
  for update using (applicant_id = auth.uid() or exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'))
  with check (applicant_id = auth.uid() or exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'));

drop policy if exists "employees self or hr select" on public.employees;
create policy "employees self or hr select" on public.employees
  for select using (user_id = auth.uid() or exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'));

drop policy if exists "employees hr write" on public.employees;
create policy "employees hr write" on public.employees
  for insert with check (exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'));

drop policy if exists "employees hr update" on public.employees;
create policy "employees hr update" on public.employees
  for update using (exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'))
  with check (exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'));

drop policy if exists "notifications self or hr select" on public.notifications;
create policy "notifications self or hr select" on public.notifications
  for select using (user_id = auth.uid() or exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'));

drop policy if exists "notifications insert" on public.notifications;
create policy "notifications insert" on public.notifications
  for insert with check (true);

drop policy if exists "notifications update self or hr" on public.notifications;
create policy "notifications update self or hr" on public.notifications
  for update using (user_id = auth.uid() or exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'))
  with check (user_id = auth.uid() or exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'));

drop policy if exists "events self or hr select" on public.application_events;
create policy "events self or hr select" on public.application_events
  for select using (
    exists (
      select 1
      from public.job_applications ja
      where ja.id = application_events.job_application_id
        and (ja.applicant_id = auth.uid() or exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'))
    )
  );

drop policy if exists "events hr insert" on public.application_events;
create policy "events hr insert" on public.application_events
  for insert with check (exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'hr'));

drop policy if exists "cvs authenticated upload" on storage.objects;
create policy "cvs authenticated upload" on storage.objects
  for insert with check (
    bucket_id = 'cvs'
    and auth.role() = 'authenticated'
  );

drop policy if exists "cvs authenticated select" on storage.objects;
create policy "cvs authenticated select" on storage.objects
  for select using (
    bucket_id = 'cvs'
    and auth.role() = 'authenticated'
  );

drop policy if exists "profile pictures authenticated upload" on storage.objects;
create policy "profile pictures authenticated upload" on storage.objects
  for insert with check (
    bucket_id = 'profile-pictures'
    and auth.role() = 'authenticated'
  );

drop policy if exists "profile pictures authenticated select" on storage.objects;
create policy "profile pictures authenticated select" on storage.objects
  for select using (
    bucket_id = 'profile-pictures'
    and auth.role() = 'authenticated'
  );
-- 005_universal_folders.sql — Universal Folders for Chats, Jobs, and Reports

-- ============================================================
-- 1. universal_folders — hierarchical folder tree per user
-- ============================================================
create table if not exists public.universal_folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  parent_id   uuid references public.universal_folders(id) on delete cascade,
  name        text not null,
  type        text not null check (type in ('chat', 'job', 'report')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_universal_folders_user_type on public.universal_folders(user_id, type);
create index if not exists idx_universal_folders_parent on public.universal_folders(parent_id);

alter table public.universal_folders enable row level security;

create policy "Users can view own folders"
  on public.universal_folders for select using (auth.uid() = user_id);
create policy "Users can insert own folders"
  on public.universal_folders for insert with check (auth.uid() = user_id);
create policy "Users can update own folders"
  on public.universal_folders for update using (auth.uid() = user_id);
create policy "Users can delete own folders"
  on public.universal_folders for delete using (auth.uid() = user_id);

-- ============================================================
-- 2. Add folder_id to resources
-- ============================================================

-- Chats
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'chats' and column_name = 'folder_id') then
    alter table public.chats add column folder_id uuid references public.universal_folders(id) on delete set null;
    create index idx_chats_folder on public.chats(folder_id);
  end if;
end $$;

-- Scheduled Jobs
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'scheduled_jobs' and column_name = 'folder_id') then
    alter table public.scheduled_jobs add column folder_id uuid references public.universal_folders(id) on delete set null;
    create index idx_jobs_folder on public.scheduled_jobs(folder_id);
  end if;
end $$;

-- Saved Reports
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'saved_reports' and column_name = 'folder_id') then
    alter table public.saved_reports add column folder_id uuid references public.universal_folders(id) on delete set null;
    create index idx_reports_folder on public.saved_reports(folder_id);
  end if;
end $$;

-- ============================================================
-- 3. RPC: get_universal_folder_breadcrumbs
-- ============================================================
create or replace function public.get_universal_folder_breadcrumbs(
  p_folder_id uuid,
  p_user_id uuid
)
returns table (id uuid, name text, parent_id uuid) as $$
  with recursive chain as (
    select f.id, f.name, f.parent_id, 0 as depth
    from public.universal_folders f
    where f.id = p_folder_id and f.user_id = p_user_id
    union all
    select f.id, f.name, f.parent_id, c.depth + 1
    from public.universal_folders f
    inner join chain c on c.parent_id = f.id
  )
  select id, name, parent_id from chain order by depth desc;
$$ language sql stable;

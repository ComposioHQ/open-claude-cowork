-- ============================================================
-- 001_initial_schema.sql — Open Claude Cowork Supabase schema
-- Run this in the Supabase SQL editor or via supabase db push
-- ============================================================

-- Enable required extensions
create extension if not exists "pgvector" with schema extensions;
create extension if not exists "pg_cron" with schema extensions;

-- ==================== PROFILES ====================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==================== CHATS ====================
create table if not exists public.chats (
  id text primary key,  -- keeps existing chat_xxx format
  user_id uuid not null references auth.users(id) on delete cascade,
  title text default 'New chat',
  provider text default 'claude',
  model text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.chats enable row level security;

create policy "Users can view own chats"
  on public.chats for select using (auth.uid() = user_id);
create policy "Users can create own chats"
  on public.chats for insert with check (auth.uid() = user_id);
create policy "Users can update own chats"
  on public.chats for update using (auth.uid() = user_id);
create policy "Users can delete own chats"
  on public.chats for delete using (auth.uid() = user_id);

-- ==================== MESSAGES ====================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text default '',
  html text default '',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_messages_chat_id on public.messages(chat_id, created_at);

alter table public.messages enable row level security;

create policy "Users can view own messages"
  on public.messages for select using (auth.uid() = user_id);
create policy "Users can create own messages"
  on public.messages for insert with check (auth.uid() = user_id);
create policy "Users can delete own messages"
  on public.messages for delete using (auth.uid() = user_id);

-- ==================== PROVIDER SESSIONS ====================
create table if not exists public.provider_sessions (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  session_id text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (chat_id, provider)
);

alter table public.provider_sessions enable row level security;

create policy "Users can view own provider sessions"
  on public.provider_sessions for select using (auth.uid() = user_id);
create policy "Users can create own provider sessions"
  on public.provider_sessions for insert with check (auth.uid() = user_id);
create policy "Users can update own provider sessions"
  on public.provider_sessions for update using (auth.uid() = user_id);

-- ==================== ATTACHMENTS ====================
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_id text references public.chats(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  file_name text not null,
  file_type text,
  file_size bigint,
  storage_path text not null,
  created_at timestamptz default now()
);

alter table public.attachments enable row level security;

create policy "Users can view own attachments"
  on public.attachments for select using (auth.uid() = user_id);
create policy "Users can create own attachments"
  on public.attachments for insert with check (auth.uid() = user_id);
create policy "Users can delete own attachments"
  on public.attachments for delete using (auth.uid() = user_id);

-- ==================== EMBEDDINGS ====================
create table if not exists public.embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('message', 'attachment')),
  source_id uuid not null,
  content_preview text,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- HNSW index for fast cosine similarity search
create index if not exists idx_embeddings_vector
  on public.embeddings using hnsw (embedding vector_cosine_ops);
create index if not exists idx_embeddings_source
  on public.embeddings(source_type, source_id);

alter table public.embeddings enable row level security;

create policy "Users can view own embeddings"
  on public.embeddings for select using (auth.uid() = user_id);
create policy "Users can create own embeddings"
  on public.embeddings for insert with check (auth.uid() = user_id);
create policy "Users can delete own embeddings"
  on public.embeddings for delete using (auth.uid() = user_id);

-- Semantic search function
create or replace function public.search_embeddings(
  query_embedding vector(1536),
  match_count int default 10,
  match_threshold float default 0.7,
  filter_user_id uuid default null
)
returns table (
  id uuid,
  source_type text,
  source_id uuid,
  content_preview text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    e.id,
    e.source_type,
    e.source_id,
    e.content_preview,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.embeddings e
  where
    (filter_user_id is null or e.user_id = filter_user_id)
    and 1 - (e.embedding <=> query_embedding) > match_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ==================== UPDATED_AT TRIGGER ====================
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_chats_updated_at
  before update on public.chats
  for each row execute function public.update_updated_at();

create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger update_provider_sessions_updated_at
  before update on public.provider_sessions
  for each row execute function public.update_updated_at();

-- ==================== STORAGE BUCKET ====================
-- Create private storage bucket for attachments
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- RLS for storage: users can only access their own folder ({userId}/*)
create policy "Users can upload to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can view own files"
  on storage.objects for select
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own files"
  on storage.objects for delete
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

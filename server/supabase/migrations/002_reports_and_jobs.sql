-- ============================================================
-- 002_reports_and_jobs.sql — Reports & Scheduled Jobs schema
-- Run this in the Supabase SQL editor or via supabase db push
-- ============================================================

-- ==================== SAVED REPORTS ====================
create table if not exists public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text default '',
  report_config jsonb not null,
  last_result jsonb,
  last_run_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_saved_reports_user
  on public.saved_reports(user_id, updated_at desc);

alter table public.saved_reports enable row level security;

create policy "Users can view own reports"
  on public.saved_reports for select using (auth.uid() = user_id);
create policy "Users can create own reports"
  on public.saved_reports for insert with check (auth.uid() = user_id);
create policy "Users can update own reports"
  on public.saved_reports for update using (auth.uid() = user_id);
create policy "Users can delete own reports"
  on public.saved_reports for delete using (auth.uid() = user_id);

create trigger update_saved_reports_updated_at
  before update on public.saved_reports
  for each row execute function public.update_updated_at();

-- ==================== SCHEDULED JOBS ====================
create table if not exists public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text default '',
  job_type text not null check (job_type in ('one_time', 'recurring', 'cron')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'failed')),
  execute_at timestamptz,
  interval_seconds integer,
  cron_expression text,
  action_type text not null check (action_type in ('chat_message', 'report_generation', 'data_export', 'webhook')),
  action_config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  next_run_at timestamptz,
  run_count integer default 0,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_scheduled_jobs_user_status
  on public.scheduled_jobs(user_id, status);
create index if not exists idx_scheduled_jobs_next_run
  on public.scheduled_jobs(status, next_run_at);

alter table public.scheduled_jobs enable row level security;

create policy "Users can view own jobs"
  on public.scheduled_jobs for select using (auth.uid() = user_id);
create policy "Users can create own jobs"
  on public.scheduled_jobs for insert with check (auth.uid() = user_id);
create policy "Users can update own jobs"
  on public.scheduled_jobs for update using (auth.uid() = user_id);
create policy "Users can delete own jobs"
  on public.scheduled_jobs for delete using (auth.uid() = user_id);

create trigger update_scheduled_jobs_updated_at
  before update on public.scheduled_jobs
  for each row execute function public.update_updated_at();

-- ==================== JOB EXECUTIONS ====================
create table if not exists public.job_executions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.scheduled_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz default now(),
  completed_at timestamptz,
  duration_ms integer,
  result jsonb default '{}'::jsonb,
  error text
);

create index if not exists idx_job_executions_job
  on public.job_executions(job_id, started_at desc);

alter table public.job_executions enable row level security;

create policy "Users can view own executions"
  on public.job_executions for select using (auth.uid() = user_id);
create policy "Users can create own executions"
  on public.job_executions for insert with check (auth.uid() = user_id);

-- ==================== REPORT RPC FUNCTIONS ====================

-- Daily message counts for the last N days
create or replace function public.report_daily_messages(
  p_user_id uuid,
  p_days integer default 30
)
returns table (
  day date,
  user_count bigint,
  assistant_count bigint,
  total_count bigint
)
language sql stable
as $$
  select
    date_trunc('day', m.created_at)::date as day,
    count(*) filter (where m.role = 'user') as user_count,
    count(*) filter (where m.role = 'assistant') as assistant_count,
    count(*) as total_count
  from public.messages m
  join public.chats c on c.id = m.chat_id
  where c.user_id = p_user_id
    and m.created_at >= now() - (p_days || ' days')::interval
  group by 1
  order by 1;
$$;

-- Provider and model usage stats
create or replace function public.report_provider_usage(
  p_user_id uuid,
  p_days integer default 30
)
returns table (
  provider text,
  model text,
  chat_count bigint,
  message_count bigint
)
language sql stable
as $$
  select
    c.provider,
    c.model,
    count(distinct c.id) as chat_count,
    count(m.id) as message_count
  from public.chats c
  left join public.messages m on m.chat_id = c.id
  where c.user_id = p_user_id
    and c.created_at >= now() - (p_days || ' days')::interval
  group by c.provider, c.model
  order by message_count desc;
$$;

-- Tool usage frequency from message metadata
create or replace function public.report_tool_usage(
  p_user_id uuid,
  p_days integer default 30
)
returns table (
  tool_name text,
  use_count bigint
)
language sql stable
as $$
  select
    tc->>'name' as tool_name,
    count(*) as use_count
  from public.messages m
  join public.chats c on c.id = m.chat_id,
  lateral jsonb_array_elements(
    case when jsonb_typeof(m.metadata->'tool_calls') = 'array'
         then m.metadata->'tool_calls'
         else '[]'::jsonb end
  ) as tc
  where c.user_id = p_user_id
    and m.created_at >= now() - (p_days || ' days')::interval
  group by 1
  order by 2 desc;
$$;

-- Summary stats
create or replace function public.report_summary(
  p_user_id uuid
)
returns table (
  total_chats bigint,
  total_messages bigint,
  active_days bigint,
  avg_messages_per_day numeric
)
language sql stable
as $$
  select
    (select count(*) from public.chats where user_id = p_user_id) as total_chats,
    (select count(*) from public.messages m join public.chats c on c.id = m.chat_id where c.user_id = p_user_id) as total_messages,
    (select count(distinct date_trunc('day', m.created_at))
     from public.messages m join public.chats c on c.id = m.chat_id
     where c.user_id = p_user_id) as active_days,
    (select round(
      count(*)::numeric / greatest(count(distinct date_trunc('day', m.created_at)), 1), 1
    )
     from public.messages m join public.chats c on c.id = m.chat_id
     where c.user_id = p_user_id) as avg_messages_per_day;
$$;

-- Generic custom query builder
create or replace function public.report_custom_query(
  p_user_id uuid,
  p_config jsonb
)
returns jsonb
language plpgsql stable
as $$
declare
  v_source text;
  v_group_by text;
  v_days integer;
  v_result jsonb;
  v_provider_filter jsonb;
  v_model_filter jsonb;
begin
  v_source := coalesce(p_config->>'source', 'messages');
  v_group_by := coalesce(p_config->>'groupBy', 'day');
  v_days := coalesce((p_config->'filters'->>'days')::integer, 30);
  v_provider_filter := p_config->'filters'->'provider';
  v_model_filter := p_config->'filters'->'model';

  if v_source = 'messages' then
    if v_group_by in ('day', 'week', 'month') then
      select jsonb_agg(row_to_json(r)) into v_result
      from (
        select
          date_trunc(v_group_by, m.created_at)::date as period,
          count(*) as count,
          round(avg(length(m.content))) as avg_length
        from public.messages m
        join public.chats c on c.id = m.chat_id
        where c.user_id = p_user_id
          and m.created_at >= now() - (v_days || ' days')::interval
          and (v_provider_filter is null or c.provider = any(select jsonb_array_elements_text(v_provider_filter)))
          and (v_model_filter is null or c.model = any(select jsonb_array_elements_text(v_model_filter)))
        group by 1
        order by 1
      ) r;
    elsif v_group_by = 'provider' then
      select jsonb_agg(row_to_json(r)) into v_result
      from (
        select
          c.provider as period,
          count(*) as count,
          round(avg(length(m.content))) as avg_length
        from public.messages m
        join public.chats c on c.id = m.chat_id
        where c.user_id = p_user_id
          and m.created_at >= now() - (v_days || ' days')::interval
        group by 1
        order by 2 desc
      ) r;
    elsif v_group_by = 'model' then
      select jsonb_agg(row_to_json(r)) into v_result
      from (
        select
          c.model as period,
          count(*) as count,
          round(avg(length(m.content))) as avg_length
        from public.messages m
        join public.chats c on c.id = m.chat_id
        where c.user_id = p_user_id
          and m.created_at >= now() - (v_days || ' days')::interval
        group by 1
        order by 2 desc
      ) r;
    end if;

  elsif v_source = 'chats' then
    if v_group_by in ('day', 'week', 'month') then
      select jsonb_agg(row_to_json(r)) into v_result
      from (
        select
          date_trunc(v_group_by, c.created_at)::date as period,
          count(*) as count
        from public.chats c
        where c.user_id = p_user_id
          and c.created_at >= now() - (v_days || ' days')::interval
        group by 1
        order by 1
      ) r;
    elsif v_group_by = 'provider' then
      select jsonb_agg(row_to_json(r)) into v_result
      from (
        select
          c.provider as period,
          count(*) as count
        from public.chats c
        where c.user_id = p_user_id
          and c.created_at >= now() - (v_days || ' days')::interval
        group by 1
        order by 2 desc
      ) r;
    elsif v_group_by = 'model' then
      select jsonb_agg(row_to_json(r)) into v_result
      from (
        select
          c.model as period,
          count(*) as count
        from public.chats c
        where c.user_id = p_user_id
          and c.created_at >= now() - (v_days || ' days')::interval
        group by 1
        order by 2 desc
      ) r;
    end if;

  elsif v_source = 'tool_calls' then
    select jsonb_agg(row_to_json(r)) into v_result
    from (
      select
        tc->>'name' as period,
        count(*) as count
      from public.messages m
      join public.chats c on c.id = m.chat_id,
      lateral jsonb_array_elements(
        case when jsonb_typeof(m.metadata->'tool_calls') = 'array'
             then m.metadata->'tool_calls'
             else '[]'::jsonb end
      ) as tc
      where c.user_id = p_user_id
        and m.created_at >= now() - (v_days || ' days')::interval
      group by 1
      order by 2 desc
    ) r;

  elsif v_source = 'attachments' then
    if v_group_by in ('day', 'week', 'month') then
      select jsonb_agg(row_to_json(r)) into v_result
      from (
        select
          date_trunc(v_group_by, a.created_at)::date as period,
          count(*) as count,
          sum(a.file_size) as total_size
        from public.attachments a
        where a.user_id = p_user_id
          and a.created_at >= now() - (v_days || ' days')::interval
        group by 1
        order by 1
      ) r;
    else
      select jsonb_agg(row_to_json(r)) into v_result
      from (
        select
          a.file_type as period,
          count(*) as count,
          sum(a.file_size) as total_size
        from public.attachments a
        where a.user_id = p_user_id
          and a.created_at >= now() - (v_days || ' days')::interval
        group by 1
        order by 2 desc
      ) r;
    end if;
  end if;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

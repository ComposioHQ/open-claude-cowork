-- ============================================================
-- 004_workflows.sql — Workflow blueprints and executions
-- Run after 002_reports_and_jobs.sql (uses update_updated_at)
-- ============================================================

-- ==================== WORKFLOWS ====================
create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text default '',
  source_chat_id text references public.chats(id) on delete set null,
  blueprint_json jsonb not null default '{}'::jsonb,
  context_refs_json jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_workflows_user
  on public.workflows(user_id, updated_at desc);

alter table public.workflows enable row level security;

create policy "Users can view own workflows"
  on public.workflows for select using (auth.uid() = user_id);
create policy "Users can create own workflows"
  on public.workflows for insert with check (auth.uid() = user_id);
create policy "Users can update own workflows"
  on public.workflows for update using (auth.uid() = user_id);
create policy "Users can delete own workflows"
  on public.workflows for delete using (auth.uid() = user_id);

create trigger update_workflows_updated_at
  before update on public.workflows
  for each row execute function public.update_updated_at();

-- ==================== WORKFLOW EXECUTIONS ====================
create table if not exists public.workflow_executions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz default now(),
  completed_at timestamptz,
  duration_ms integer,
  result_json jsonb default '{}'::jsonb,
  error text
);

create index if not exists idx_workflow_executions_workflow
  on public.workflow_executions(workflow_id, started_at desc);

alter table public.workflow_executions enable row level security;

create policy "Users can view own workflow executions"
  on public.workflow_executions for select using (auth.uid() = user_id);
create policy "Users can create own workflow executions"
  on public.workflow_executions for insert with check (auth.uid() = user_id);

-- Allow run_workflow action type for scheduled jobs (workflow blueprint runs)
alter table public.scheduled_jobs
  drop constraint if exists scheduled_jobs_action_type_check;
alter table public.scheduled_jobs
  add constraint scheduled_jobs_action_type_check
  check (action_type in ('chat_message', 'report_generation', 'data_export', 'webhook', 'run_workflow'));

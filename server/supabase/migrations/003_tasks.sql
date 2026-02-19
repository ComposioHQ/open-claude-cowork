-- ============================================================
-- 003_tasks.sql — Task Management schema (DEPRECATED: Tasks feature removed from app; migration kept for historical deployments.)
-- Run this in the Supabase SQL editor or via supabase db push
-- ============================================================

-- ==================== TASKS ====================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text default '',
  status text not null default 'todo' check (status in ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
  priority integer not null default 3 check (priority >= 0 and priority <= 4),
  due_date timestamptz,
  position integer not null default 0,
  scheduled_job_id uuid references public.scheduled_jobs(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_tasks_user_status
  on public.tasks(user_id, status);
create index if not exists idx_tasks_user_due
  on public.tasks(user_id, due_date);
create index if not exists idx_tasks_user_priority
  on public.tasks(user_id, priority);
create index if not exists idx_tasks_position
  on public.tasks(user_id, status, position);

alter table public.tasks enable row level security;

create policy "Users can view own tasks"
  on public.tasks for select using (auth.uid() = user_id);
create policy "Users can create own tasks"
  on public.tasks for insert with check (auth.uid() = user_id);
create policy "Users can update own tasks"
  on public.tasks for update using (auth.uid() = user_id);
create policy "Users can delete own tasks"
  on public.tasks for delete using (auth.uid() = user_id);

create trigger update_tasks_updated_at
  before update on public.tasks
  for each row execute function public.update_updated_at();

-- ==================== TASK LABELS ====================
create table if not exists public.task_labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#c4917b',
  created_at timestamptz default now(),
  unique (user_id, name)
);

alter table public.task_labels enable row level security;

create policy "Users can view own task labels"
  on public.task_labels for select using (auth.uid() = user_id);
create policy "Users can create own task labels"
  on public.task_labels for insert with check (auth.uid() = user_id);
create policy "Users can update own task labels"
  on public.task_labels for update using (auth.uid() = user_id);
create policy "Users can delete own task labels"
  on public.task_labels for delete using (auth.uid() = user_id);

-- ==================== TASK LABEL ASSIGNMENTS ====================
create table if not exists public.task_label_assignments (
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.task_labels(id) on delete cascade,
  primary key (task_id, label_id)
);

alter table public.task_label_assignments enable row level security;

-- RLS via join to task_labels for user ownership check
create policy "Users can view own task label assignments"
  on public.task_label_assignments for select
  using (exists (
    select 1 from public.task_labels tl where tl.id = label_id and tl.user_id = auth.uid()
  ));
create policy "Users can create own task label assignments"
  on public.task_label_assignments for insert
  with check (exists (
    select 1 from public.task_labels tl where tl.id = label_id and tl.user_id = auth.uid()
  ));
create policy "Users can delete own task label assignments"
  on public.task_label_assignments for delete
  using (exists (
    select 1 from public.task_labels tl where tl.id = label_id and tl.user_id = auth.uid()
  ));

-- ==================== RPC FUNCTIONS ====================

-- Get tasks in a date range with labels
create or replace function public.tasks_in_range(
  p_user_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns json
language plpgsql
security definer
as $$
begin
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    from (
      select
        tk.id, tk.title, tk.description, tk.status, tk.priority,
        tk.due_date, tk.position, tk.scheduled_job_id,
        tk.created_at, tk.updated_at,
        coalesce(
          (select json_agg(json_build_object('id', tl.id, 'name', tl.name, 'color', tl.color))
           from public.task_label_assignments tla
           join public.task_labels tl on tl.id = tla.label_id
           where tla.task_id = tk.id),
          '[]'::json
        ) as labels
      from public.tasks tk
      where tk.user_id = p_user_id
        and tk.due_date >= p_start
        and tk.due_date < p_end
      order by tk.due_date asc, tk.priority asc
    ) t
  );
end;
$$;

-- Get tasks grouped by status with labels
create or replace function public.tasks_by_status(p_user_id uuid)
returns json
language plpgsql
security definer
as $$
begin
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    from (
      select
        tk.id, tk.title, tk.description, tk.status, tk.priority,
        tk.due_date, tk.position, tk.scheduled_job_id,
        tk.created_at, tk.updated_at,
        coalesce(
          (select json_agg(json_build_object('id', tl.id, 'name', tl.name, 'color', tl.color))
           from public.task_label_assignments tla
           join public.task_labels tl on tl.id = tla.label_id
           where tla.task_id = tk.id),
          '[]'::json
        ) as labels
      from public.tasks tk
      where tk.user_id = p_user_id
      order by tk.status, tk.position asc, tk.priority asc
    ) t
  );
end;
$$;

-- Reorder a task: move to new status column at given position
create or replace function public.tasks_reorder(
  p_user_id uuid,
  p_task_id uuid,
  p_new_status text,
  p_new_position integer
)
returns void
language plpgsql
security definer
as $$
declare
  v_old_status text;
  v_old_position integer;
begin
  -- Get current status and position
  select status, position into v_old_status, v_old_position
  from public.tasks
  where id = p_task_id and user_id = p_user_id;

  if not found then
    raise exception 'Task not found';
  end if;

  -- If moving within the same column
  if v_old_status = p_new_status then
    if v_old_position < p_new_position then
      -- Moving down: shift items between old and new position up
      update public.tasks
      set position = position - 1
      where user_id = p_user_id
        and status = p_new_status
        and position > v_old_position
        and position <= p_new_position;
    elsif v_old_position > p_new_position then
      -- Moving up: shift items between new and old position down
      update public.tasks
      set position = position + 1
      where user_id = p_user_id
        and status = p_new_status
        and position >= p_new_position
        and position < v_old_position;
    end if;
  else
    -- Moving to a different column
    -- Close gap in old column
    update public.tasks
    set position = position - 1
    where user_id = p_user_id
      and status = v_old_status
      and position > v_old_position;

    -- Make space in new column
    update public.tasks
    set position = position + 1
    where user_id = p_user_id
      and status = p_new_status
      and position >= p_new_position;
  end if;

  -- Move the task
  update public.tasks
  set status = p_new_status,
      position = p_new_position
  where id = p_task_id and user_id = p_user_id;
end;
$$;

create table if not exists public.ai_design_jobs (
  id uuid primary key default gen_random_uuid(),
  task_id text not null unique references public.test_tasks(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','analyzing','needs_input','ready_for_generation','failed')),
  request_snapshot jsonb not null default '{}'::jsonb,
  analysis jsonb not null default '{}'::jsonb,
  error_message text,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.ai_design_jobs enable row level security;

create policy "AI designer and administrators can read AI jobs"
  on public.ai_design_jobs for select to authenticated
  using (
    lower(coalesce(auth.jwt()->'user_metadata'->>'enName','')) = 'davis.design.ai'
    or (auth.jwt()->'user_metadata'->'perms') ? 'admin'
  );

create or replace function public.enqueue_ai_design_job()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(coalesce(new.assignee,'')) = 'davis.design.ai'
     and new.status in ('pending','pending_accept','processing') then
    insert into public.ai_design_jobs(task_id, request_snapshot)
    values (
      new.id,
      jsonb_build_object(
        'title', new.title,
        'full_desc', new.full_desc,
        'project', new.project,
        'due_date', new.due_date,
        'channels', new.channels,
        'link', new.link,
        'file_name', new.file_name,
        'creator', new.creator
      )
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists test_tasks_enqueue_ai_design_job on public.test_tasks;
create trigger test_tasks_enqueue_ai_design_job
after insert or update of assignee, status on public.test_tasks
for each row execute function public.enqueue_ai_design_job();

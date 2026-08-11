create table if not exists public.video_deliverables (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  parent_group_id uuid not null references public.video_project_groups(id) on delete cascade,
  name text not null,
  deliverable_type text,
  description text,
  sort_order integer not null default 0,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_deliverables_name_not_blank check (btrim(name) <> ''),
  constraint video_deliverables_status_check check (status in ('active','deleted'))
);

create index if not exists video_deliverables_owner_parent_idx
  on public.video_deliverables(owner_id, parent_group_id, sort_order, created_at);
create unique index if not exists video_deliverables_active_name_unique
  on public.video_deliverables(owner_id, parent_group_id, lower(btrim(name)))
  where status <> 'deleted';

alter table public.video_projects
  add column if not exists deliverable_id uuid references public.video_deliverables(id) on delete set null,
  add column if not exists subject_key text,
  add column if not exists attempt_no integer not null default 1,
  add column if not exists retry_of_project_id uuid references public.video_projects(id) on delete set null,
  add column if not exists review_status text not null default 'draft';

do $$ begin
  alter table public.video_projects
    add constraint video_projects_attempt_no_check check (attempt_no >= 1);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.video_projects
    add constraint video_projects_review_status_check check (
      review_status in ('draft','pending_review','accepted','backup','rejected','needs_retry')
    );
exception when duplicate_object then null; end $$;

create index if not exists video_projects_deliverable_idx
  on public.video_projects(deliverable_id, task_order, created_at);
create index if not exists video_projects_subject_attempt_idx
  on public.video_projects(owner_id, deliverable_id, subject_key, attempt_no)
  where subject_key is not null;
create index if not exists video_projects_retry_of_idx
  on public.video_projects(retry_of_project_id)
  where retry_of_project_id is not null;

create or replace function public.r54_validate_deliverable_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  group_owner uuid;
begin
  select owner_id into group_owner
  from public.video_project_groups
  where id = new.parent_group_id and coalesce(status,'active') <> 'deleted';

  if group_owner is null then
    raise exception 'R54_PARENT_GROUP_NOT_FOUND';
  end if;
  if group_owner <> new.owner_id then
    raise exception 'R54_DELIVERABLE_OWNER_MISMATCH';
  end if;
  return new;
end;
$$;

drop trigger if exists r54_validate_deliverable_owner on public.video_deliverables;
create trigger r54_validate_deliverable_owner
before insert or update of owner_id, parent_group_id
on public.video_deliverables
for each row execute function public.r54_validate_deliverable_owner();

create or replace function public.r54_validate_project_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d_owner uuid;
  d_group uuid;
  retry_owner uuid;
begin
  if new.deliverable_id is not null then
    select owner_id, parent_group_id into d_owner, d_group
    from public.video_deliverables
    where id = new.deliverable_id and status <> 'deleted';
    if d_owner is null then
      raise exception 'R54_DELIVERABLE_NOT_FOUND';
    end if;
    if d_owner <> new.owner_id then
      raise exception 'R54_PROJECT_DELIVERABLE_OWNER_MISMATCH';
    end if;
    if new.parent_group_id is not null and d_group <> new.parent_group_id then
      raise exception 'R54_PROJECT_DELIVERABLE_PARENT_MISMATCH';
    end if;
  end if;

  if new.retry_of_project_id is not null then
    select owner_id into retry_owner
    from public.video_projects
    where id = new.retry_of_project_id;
    if retry_owner is null then
      raise exception 'R54_RETRY_SOURCE_NOT_FOUND';
    end if;
    if retry_owner <> new.owner_id then
      raise exception 'R54_RETRY_SOURCE_OWNER_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists r54_validate_project_links on public.video_projects;
create trigger r54_validate_project_links
before insert or update of owner_id, parent_group_id, deliverable_id, retry_of_project_id
on public.video_projects
for each row execute function public.r54_validate_project_links();

drop trigger if exists video_deliverables_set_updated_at on public.video_deliverables;
create trigger video_deliverables_set_updated_at
before update on public.video_deliverables
for each row execute function public.update_updated_at_column();

alter table public.video_deliverables enable row level security;

drop policy if exists video_deliverables_select_policy on public.video_deliverables;
create policy video_deliverables_select_policy
on public.video_deliverables for select
to authenticated
using (
  auth.uid() = owner_id
  or lower(coalesce(auth.jwt() ->> 'email','')) = any(array['davidxxu@webank.com','judyzzhang@webank.com'])
);

drop policy if exists video_deliverables_insert_policy on public.video_deliverables;
create policy video_deliverables_insert_policy
on public.video_deliverables for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.video_project_groups g
    where g.id = parent_group_id and g.owner_id = auth.uid() and coalesce(g.status,'active') <> 'deleted'
  )
);

drop policy if exists video_deliverables_update_policy on public.video_deliverables;
create policy video_deliverables_update_policy
on public.video_deliverables for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.video_project_groups g
    where g.id = parent_group_id and g.owner_id = auth.uid() and coalesce(g.status,'active') <> 'deleted'
  )
);

drop policy if exists video_deliverables_delete_policy on public.video_deliverables;
create policy video_deliverables_delete_policy
on public.video_deliverables for delete
to authenticated
using (auth.uid() = owner_id);

grant select, insert, update, delete on public.video_deliverables to authenticated;
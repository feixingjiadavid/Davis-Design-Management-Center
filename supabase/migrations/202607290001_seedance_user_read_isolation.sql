-- Seedance/Davis Video: owner-only writes, owner-or-super-admin reads.
-- Super-admin identity uses the immutable Auth JWT email claim, not user_metadata.

alter table public.video_projects enable row level security;

drop policy if exists video_projects_owner_policy on public.video_projects;
drop policy if exists video_projects_select_policy on public.video_projects;
drop policy if exists video_projects_insert_policy on public.video_projects;
drop policy if exists video_projects_update_policy on public.video_projects;
drop policy if exists video_projects_delete_policy on public.video_projects;

create policy video_projects_select_policy
on public.video_projects
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or lower(coalesce((select auth.jwt()) ->> 'email', '')) in (
    'davidxxu@webank.com',
    'judyzzhang@webank.com'
  )
);

create policy video_projects_insert_policy
on public.video_projects
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy video_projects_update_policy
on public.video_projects
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy video_projects_delete_policy
on public.video_projects
for delete
to authenticated
using ((select auth.uid()) = owner_id);

alter table public.video_assets enable row level security;

drop policy if exists video_assets_owner_policy on public.video_assets;
drop policy if exists video_assets_select_policy on public.video_assets;
drop policy if exists video_assets_insert_policy on public.video_assets;
drop policy if exists video_assets_update_policy on public.video_assets;
drop policy if exists video_assets_delete_policy on public.video_assets;

create policy video_assets_select_policy
on public.video_assets
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or lower(coalesce((select auth.jwt()) ->> 'email', '')) in (
    'davidxxu@webank.com',
    'judyzzhang@webank.com'
  )
);

create policy video_assets_insert_policy
on public.video_assets
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy video_assets_update_policy
on public.video_assets
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy video_assets_delete_policy
on public.video_assets
for delete
to authenticated
using ((select auth.uid()) = owner_id);

alter table public.video_segments enable row level security;

drop policy if exists video_segments_owner_policy on public.video_segments;
drop policy if exists video_segments_select_policy on public.video_segments;
drop policy if exists video_segments_insert_policy on public.video_segments;
drop policy if exists video_segments_update_policy on public.video_segments;
drop policy if exists video_segments_delete_policy on public.video_segments;

create policy video_segments_select_policy
on public.video_segments
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or lower(coalesce((select auth.jwt()) ->> 'email', '')) in (
    'davidxxu@webank.com',
    'judyzzhang@webank.com'
  )
);

create policy video_segments_insert_policy
on public.video_segments
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy video_segments_update_policy
on public.video_segments
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy video_segments_delete_policy
on public.video_segments
for delete
to authenticated
using ((select auth.uid()) = owner_id);

alter table public.video_tasks enable row level security;

drop policy if exists video_tasks_owner_policy on public.video_tasks;
drop policy if exists video_tasks_select_policy on public.video_tasks;
drop policy if exists video_tasks_insert_policy on public.video_tasks;
drop policy if exists video_tasks_update_policy on public.video_tasks;
drop policy if exists video_tasks_delete_policy on public.video_tasks;

create policy video_tasks_select_policy
on public.video_tasks
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or lower(coalesce((select auth.jwt()) ->> 'email', '')) in (
    'davidxxu@webank.com',
    'judyzzhang@webank.com'
  )
);

create policy video_tasks_insert_policy
on public.video_tasks
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy video_tasks_update_policy
on public.video_tasks
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy video_tasks_delete_policy
on public.video_tasks
for delete
to authenticated
using ((select auth.uid()) = owner_id);

alter table public.video_outputs enable row level security;

drop policy if exists video_outputs_owner_policy on public.video_outputs;
drop policy if exists video_outputs_select_policy on public.video_outputs;
drop policy if exists video_outputs_insert_policy on public.video_outputs;
drop policy if exists video_outputs_update_policy on public.video_outputs;
drop policy if exists video_outputs_delete_policy on public.video_outputs;

create policy video_outputs_select_policy
on public.video_outputs
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or lower(coalesce((select auth.jwt()) ->> 'email', '')) in (
    'davidxxu@webank.com',
    'judyzzhang@webank.com'
  )
);

create policy video_outputs_insert_policy
on public.video_outputs
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy video_outputs_update_policy
on public.video_outputs
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy video_outputs_delete_policy
on public.video_outputs
for delete
to authenticated
using ((select auth.uid()) = owner_id);

alter table public.video_operation_logs enable row level security;

drop policy if exists video_operation_logs_owner_policy on public.video_operation_logs;
drop policy if exists video_operation_logs_select_policy on public.video_operation_logs;
drop policy if exists video_operation_logs_insert_policy on public.video_operation_logs;
drop policy if exists video_operation_logs_update_policy on public.video_operation_logs;
drop policy if exists video_operation_logs_delete_policy on public.video_operation_logs;

create policy video_operation_logs_select_policy
on public.video_operation_logs
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or lower(coalesce((select auth.jwt()) ->> 'email', '')) in (
    'davidxxu@webank.com',
    'judyzzhang@webank.com'
  )
);

create policy video_operation_logs_insert_policy
on public.video_operation_logs
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy video_operation_logs_update_policy
on public.video_operation_logs
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy video_operation_logs_delete_policy
on public.video_operation_logs
for delete
to authenticated
using ((select auth.uid()) = owner_id);


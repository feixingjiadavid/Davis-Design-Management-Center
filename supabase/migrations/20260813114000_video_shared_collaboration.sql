-- Video Studio R17: authenticated internal collaboration.
-- Read and creation workflows are shared across authenticated users, while
-- ownership remains immutable and destructive operations remain owner-only.

-- All authenticated users can discover the shared Video Studio project space.
drop policy if exists video_project_groups_select_policy on public.video_project_groups;
create policy video_project_groups_select_policy
  on public.video_project_groups for select to authenticated
  using (auth.uid() is not null);

drop policy if exists video_projects_select_policy on public.video_projects;
create policy video_projects_select_policy
  on public.video_projects for select to authenticated
  using (auth.uid() is not null);

drop policy if exists video_deliverables_select_policy on public.video_deliverables;
create policy video_deliverables_select_policy
  on public.video_deliverables for select to authenticated
  using (auth.uid() is not null);

drop policy if exists video_assets_select_policy on public.video_assets;
create policy video_assets_select_policy
  on public.video_assets for select to authenticated
  using (auth.uid() is not null);

drop policy if exists video_segments_select_policy on public.video_segments;
create policy video_segments_select_policy
  on public.video_segments for select to authenticated
  using (auth.uid() is not null);

drop policy if exists video_tasks_select_policy on public.video_tasks;
create policy video_tasks_select_policy
  on public.video_tasks for select to authenticated
  using (auth.uid() is not null);

drop policy if exists video_outputs_select_policy on public.video_outputs;
create policy video_outputs_select_policy
  on public.video_outputs for select to authenticated
  using (auth.uid() is not null);

drop policy if exists video_operation_logs_select_policy on public.video_operation_logs;
create policy video_operation_logs_select_policy
  on public.video_operation_logs for select to authenticated
  using (auth.uid() is not null);

drop policy if exists video_provider_policy_events_select_policy on public.video_provider_policy_events;
create policy video_provider_policy_events_select_policy
  on public.video_provider_policy_events for select to authenticated
  using (auth.uid() is not null);

-- A collaborator may create a deliverable in an existing active project group,
-- but the new deliverable is owned by the collaborator who created it.
drop policy if exists video_deliverables_insert_policy on public.video_deliverables;
create policy video_deliverables_insert_policy
  on public.video_deliverables for insert to authenticated
  with check (
    auth.uid() = owner_id
    and exists (
      select 1
      from public.video_project_groups g
      where g.id = video_deliverables.parent_group_id
        and coalesce(g.status, 'active') <> 'deleted'
    )
  );

-- Review/classification metadata on a shared child project may be updated by any
-- authenticated collaborator. A trigger below prevents ownership, deletion, or
-- unrelated project fields from being changed by non-owners.
drop policy if exists video_projects_update_policy on public.video_projects;
create policy video_projects_update_policy
  on public.video_projects for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create or replace function public.guard_shared_video_project_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'video project owner_id is immutable';
  end if;

  if auth.uid() is distinct from old.owner_id then
    -- Non-owners may only change collaboration metadata used by the Video Studio
    -- review/deliverable layer. All identity, hierarchy, generation and deletion
    -- fields stay owner-controlled.
    if (
      to_jsonb(new) - array[
        'review_status',
        'deliverable_id',
        'subject_key',
        'attempt_no',
        'retry_of_project_id',
        'updated_at'
      ]::text[]
    ) is distinct from (
      to_jsonb(old) - array[
        'review_status',
        'deliverable_id',
        'subject_key',
        'attempt_no',
        'retry_of_project_id',
        'updated_at'
      ]::text[]
    ) then
      raise exception 'shared collaborator cannot modify owner-only project fields';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_shared_video_project_update on public.video_projects;
create trigger guard_shared_video_project_update
before update on public.video_projects
for each row execute function public.guard_shared_video_project_update();

-- Existing INSERT/UPDATE/DELETE policies on assets, segments, tasks and outputs
-- remain owner-scoped. This keeps every paid generation and uploaded artifact
-- attributed to the authenticated user who actually created it.

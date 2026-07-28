alter table public.video_outputs
  add column if not exists google_drive_file_id text,
  add column if not exists google_drive_url text,
  add column if not exists google_drive_thumbnail_url text,
  add column if not exists status text not null default 'pending',
  add column if not exists storage_status text not null default 'pending',
  add column if not exists storage_error text,
  add column if not exists storage_attempts integer not null default 0,
  add column if not exists storage_updated_at timestamptz not null default now(),
  add column if not exists storage_next_retry_at timestamptz,
  add column if not exists google_drive_synced_at timestamptz;

update public.video_outputs
set
  google_drive_file_id = coalesce(
    google_drive_file_id,
    metadata->>'google_drive_file_id',
    metadata->>'googleDriveFileId',
    metadata->>'drive_file_id',
    metadata->>'driveFileId'
  ),
  google_drive_url = coalesce(
    google_drive_url,
    metadata->>'google_drive_url',
    case
      when coalesce(metadata->>'google_drive_file_id', metadata->>'googleDriveFileId', metadata->>'drive_file_id', metadata->>'driveFileId') is not null
      then 'https://drive.google.com/file/d/' || coalesce(metadata->>'google_drive_file_id', metadata->>'googleDriveFileId', metadata->>'drive_file_id', metadata->>'driveFileId') || '/view'
    end
  ),
  google_drive_thumbnail_url = coalesce(
    google_drive_thumbnail_url,
    metadata->>'google_drive_thumbnail_url',
    case
      when coalesce(metadata->>'google_drive_file_id', metadata->>'googleDriveFileId', metadata->>'drive_file_id', metadata->>'driveFileId') is not null
      then 'https://drive.google.com/thumbnail?id=' || coalesce(metadata->>'google_drive_file_id', metadata->>'googleDriveFileId', metadata->>'drive_file_id', metadata->>'driveFileId') || '&sz=w640'
    end
  ),
  status = case
    when coalesce(google_drive_file_id, metadata->>'google_drive_file_id', metadata->>'googleDriveFileId', metadata->>'drive_file_id', metadata->>'driveFileId') is not null then 'completed'
    else 'pending'
  end,
  storage_status = case
    when coalesce(google_drive_file_id, metadata->>'google_drive_file_id', metadata->>'googleDriveFileId', metadata->>'drive_file_id', metadata->>'driveFileId') is not null then 'completed'
    else 'pending'
  end,
  storage_error = null,
  storage_next_retry_at = null,
  google_drive_synced_at = case
    when coalesce(google_drive_file_id, metadata->>'google_drive_file_id', metadata->>'googleDriveFileId', metadata->>'drive_file_id', metadata->>'driveFileId') is not null
    then coalesce(google_drive_synced_at, created_at)
    else google_drive_synced_at
  end;

create index if not exists video_outputs_drive_sync_idx
  on public.video_outputs (storage_status, storage_next_retry_at, storage_updated_at);

create or replace function public.sync_seedance_task_result(
  p_task_id uuid,
  p_provider_response jsonb,
  p_normalized_status text,
  p_progress integer,
  p_error_message text,
  p_video_url text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_task public.video_tasks%rowtype;
  v_status text := lower(coalesce(p_normalized_status, 'unknown'));
  v_current text;
  v_progress integer := greatest(coalesce(p_progress, 0), 0);
  v_error text := nullif(p_error_message, '');
  v_output_id uuid;
  v_current_rank integer;
  v_incoming_rank integer;
begin
  select * into v_task from public.video_tasks where id = p_task_id for update;
  if not found then raise exception 'video task % not found', p_task_id; end if;

  v_current := lower(coalesce(v_task.status, 'queued'));
  if v_status not in ('queued', 'running', 'succeeded', 'failed') then
    v_status := v_current;
    v_progress := v_task.progress;
  end if;
  if v_status = 'succeeded' and coalesce(p_video_url, '') = '' then
    if v_current in ('succeeded', 'failed') then
      return jsonb_build_object('status', v_task.status, 'progress', v_task.progress, 'error_message', v_task.error_message, 'output_id', null);
    end if;
    v_status := 'running';
    v_progress := greatest(coalesce(v_task.progress, 0), 60);
    v_error := 'Ark succeeded but video URL is missing; retrying';
  end if;
  if v_current in ('succeeded', 'failed') then
    if not (v_current = 'succeeded' and v_status = 'succeeded' and coalesce(p_video_url, '') <> '') then
      return jsonb_build_object(
        'status', v_task.status,
        'progress', v_task.progress,
        'error_message', v_task.error_message,
        'output_id', (select id from public.video_outputs where task_id = v_task.id order by created_at desc limit 1)
      );
    end if;
    v_status := v_current;
    v_progress := v_task.progress;
  end if;

  v_current_rank := case when v_current in ('submitting','submitted','queued') then 1 when v_current in ('processing','running') then 2 when v_current in ('succeeded','failed') then 3 else 0 end;
  v_incoming_rank := case when v_status='queued' then 1 when v_status='running' then 2 when v_status in ('succeeded','failed') then 3 else 0 end;
  if v_incoming_rank < v_current_rank then
    v_status := v_current; v_progress := v_task.progress; v_error := v_task.error_message;
  end if;

  if v_status = 'succeeded' and coalesce(p_video_url, '') <> '' then
    insert into public.video_outputs (
      owner_id, task_id, project_id, segment_id, bucket_id, storage_path, metadata,
      status, storage_status, storage_error, storage_updated_at
    ) values (
      v_task.owner_id, v_task.id, v_task.project_id, v_task.segment_id,
      'ark-url', 'ark://' || v_task.provider_task_id || '.mp4',
      jsonb_build_object(
        'ark_response', p_provider_response,
        'provider_task_id', v_task.provider_task_id,
        'provider_video_url', p_video_url,
        'provider_video_url_refreshed_at', p_now,
        'storage_backend', 'google_drive_pending'
      ),
      'pending', 'pending', null, p_now
    )
    on conflict (task_id) do update set
      metadata = coalesce(public.video_outputs.metadata, '{}'::jsonb) || excluded.metadata,
      status = case when public.video_outputs.google_drive_file_id is not null then 'completed' else 'pending' end,
      storage_status = case when public.video_outputs.google_drive_file_id is not null then 'completed' else 'pending' end,
      storage_error = null,
      storage_updated_at = p_now,
      storage_next_retry_at = null
    returning id into v_output_id;
  end if;

  if v_task.segment_id is not null then
    update public.video_segments set status=v_status, updated_at=p_now
    where id=v_task.segment_id and owner_id=v_task.owner_id;
  end if;
  update public.video_tasks set
    status=v_status,
    progress=case when v_status in ('succeeded','failed') then 100 else v_progress end,
    error_message=case when v_status='failed' then coalesce(v_error,'Ark generation failed') when v_status='succeeded' then null else v_error end,
    provider_response=p_provider_response,
    started_at=case when v_status='running' then coalesce(started_at,p_now) else started_at end,
    completed_at=case when v_status in ('succeeded','failed') then coalesce(completed_at,p_now) else completed_at end,
    updated_at=p_now
  where id=v_task.id;
  return jsonb_build_object(
    'status',v_status,
    'progress',case when v_status in ('succeeded','failed') then 100 else v_progress end,
    'error_message',case when v_status='failed' then coalesce(v_error,'Ark generation failed') when v_status='succeeded' then null else v_error end,
    'output_id',v_output_id
  );
end
$function$;

revoke all on function public.sync_seedance_task_result(uuid,jsonb,text,integer,text,text,timestamptz) from public;
grant execute on function public.sync_seedance_task_result(uuid,jsonb,text,integer,text,text,timestamptz) to service_role;

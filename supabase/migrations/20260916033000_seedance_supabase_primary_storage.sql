create or replace function public.seedance_route_provider_output_to_primary()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if new.bucket_id = 'ark-url'
     and coalesce(new.metadata->>'provider_video_url', '') <> ''
     and coalesce(new.google_drive_file_id, '') = '' then
    new.status := 'primary_pending';
    new.storage_status := 'primary_pending';
    new.storage_error := null;
    new.storage_next_retry_at := null;
    new.storage_updated_at := now();
  end if;
  return new;
end
$function$;

drop trigger if exists seedance_route_provider_output_to_primary on public.video_outputs;
create trigger seedance_route_provider_output_to_primary
before insert or update of bucket_id, metadata, google_drive_file_id
on public.video_outputs
for each row
execute function public.seedance_route_provider_output_to_primary();

-- Recover recent outputs that were generated successfully but were incorrectly
-- exposed as failures only because Google Drive backup failed.
update public.video_outputs
set
  status = 'primary_pending',
  storage_status = 'primary_pending',
  storage_error = null,
  storage_next_retry_at = null,
  storage_updated_at = now(),
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'google_drive_backup_status', 'failed',
    'primary_recovery_requested_at', now()
  )
where created_at >= now() - interval '7 days'
  and coalesce(metadata->>'provider_video_url', '') <> ''
  and bucket_id = 'ark-url'
  and coalesce(google_drive_file_id, '') = ''
  and (storage_status in ('failed', 'pending', 'uploading') or status = 'drive_failed');

-- The primary-store worker owns Drive backup retries from this point onward.
-- Existing worker ignores primary_pending rows, so backup can no longer block playback.
do $block$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'seedance-output-store'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end
$block$;

select cron.schedule(
  'seedance-output-store',
  '* * * * *',
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'seedance_project_url'
      ) || '/functions/v1/seedance-output-store',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-seedance-worker-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'seedance_worker_cron_secret'
        )
      ),
      body := jsonb_build_object('source', 'pg_cron', 'limit', 10),
      timeout_milliseconds := 50000
    ) as request_id;
  $cron$
);

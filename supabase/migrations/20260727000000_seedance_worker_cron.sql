do $block$
begin
  if exists (
    select 1
    from public.video_outputs
    where task_id is not null
    group by task_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate video_outputs.task_id rows must be reconciled before installing Seedance worker';
  end if;
end
$block$;

create unique index if not exists video_outputs_task_id_unique
  on public.video_outputs (task_id);

create or replace function public.validate_seedance_worker_secret(candidate text)
returns boolean
language sql
security definer
set search_path = public, vault
as $function$
  select length(coalesce(candidate, '')) >= 32
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'seedance_worker_cron_secret'
        and decrypted_secret = candidate
    );
$function$;

revoke all on function public.validate_seedance_worker_secret(text) from public;
revoke all on function public.validate_seedance_worker_secret(text) from anon;
revoke all on function public.validate_seedance_worker_secret(text) from authenticated;
grant execute on function public.validate_seedance_worker_secret(text) to service_role;

do $block$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'seedance_worker_cron_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'seedance_worker_cron_secret',
      'Authenticates pg_cron calls to seedance-worker'
    );
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'seedance_project_url'
  ) then
    perform vault.create_secret(
      'https://supffjeeouibhqdfqosk.supabase.co',
      'seedance_project_url',
      'Davis Video Supabase project URL'
    );
  end if;
end
$block$;

select cron.schedule(
  'seedance-task-status-worker',
  '* * * * *',
  $cron$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'seedance_project_url'
      ) || '/functions/v1/seedance-worker',
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

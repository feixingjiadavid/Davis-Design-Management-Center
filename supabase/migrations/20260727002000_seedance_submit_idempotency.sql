create unique index if not exists video_tasks_owner_submit_nonce_unique
  on public.video_tasks (
    owner_id,
    (request_payload ->> 'client_submit_nonce')
  )
  where nullif(request_payload ->> 'client_submit_nonce', '') is not null;

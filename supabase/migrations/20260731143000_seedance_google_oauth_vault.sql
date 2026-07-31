create table if not exists public.video_google_oauth_flows (
  flow_token uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  used_at timestamptz,
  provider text not null default 'google_drive'
);

alter table public.video_google_oauth_flows enable row level security;
revoke all on table public.video_google_oauth_flows from anon, authenticated;
grant select, insert, update, delete on table public.video_google_oauth_flows to service_role;

create or replace function public.set_seedance_google_refresh_token(p_refresh_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if nullif(btrim(p_refresh_token), '') is null then
    raise exception 'refresh token is required';
  end if;

  select id into v_secret_id
  from vault.secrets
  where name = 'seedance_google_refresh_token'
  limit 1;

  if v_secret_id is null then
    perform vault.create_secret(
      btrim(p_refresh_token),
      'seedance_google_refresh_token',
      'Davis Video Google Drive OAuth refresh token'
    );
  else
    perform vault.update_secret(
      v_secret_id,
      btrim(p_refresh_token),
      'seedance_google_refresh_token',
      'Davis Video Google Drive OAuth refresh token'
    );
  end if;
end;
$$;

create or replace function public.get_seedance_google_refresh_token()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'seedance_google_refresh_token'
  limit 1
$$;

revoke all on function public.set_seedance_google_refresh_token(text) from public, anon, authenticated;
revoke all on function public.get_seedance_google_refresh_token() from public, anon, authenticated;
grant execute on function public.set_seedance_google_refresh_token(text) to service_role;
grant execute on function public.get_seedance_google_refresh_token() to service_role;

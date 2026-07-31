alter table public.video_projects
  add column if not exists version_root_id uuid references public.video_projects(id),
  add column if not exists version_number integer not null default 1 check (version_number >= 1),
  add column if not exists version_source_project_id uuid references public.video_projects(id);

alter table public.video_assets
  add column if not exists analysis_metadata jsonb not null default '{}'::jsonb;

alter table public.video_tasks
  add column if not exists metadata jsonb not null default '{}'::jsonb;

with classified as (
  select
    id,
    owner_id,
    regexp_replace(name, '(?i)\s+v-\d+\s*$', '') as base_name,
    coalesce(nullif((regexp_match(name, '(?i)\s+v-(\d+)\s*$'))[1], '')::integer, 1) as parsed_version,
    created_at
  from public.video_projects
),
roots as (
  select distinct on (owner_id, base_name)
    owner_id, base_name, id as root_id
  from classified
  order by owner_id, base_name, created_at, id
)
update public.video_projects p
set version_root_id = r.root_id, version_number = c.parsed_version
from classified c
join roots r on r.owner_id = c.owner_id and r.base_name = c.base_name
where p.id = c.id;

alter table public.video_projects alter column version_root_id set not null;

create index if not exists video_projects_version_root_idx
  on public.video_projects(version_root_id, version_number);

create table if not exists public.video_material_rights_confirmations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  project_version_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  terms_version text not null,
  confirmation_type text not null check (
    confirmation_type = 'temporary_reference_person_material_rights'
  ),
  created_at timestamptz not null default now(),
  unique (project_version_id, user_id, terms_version, confirmation_type)
);

create index if not exists video_material_rights_project_version_idx
  on public.video_material_rights_confirmations(project_version_id, user_id);

create table if not exists public.video_provider_policy_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.video_tasks(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'ark'),
  model text not null,
  endpoint text not null,
  submit_mode text not null,
  task_type text not null,
  image_role text,
  image_count integer not null default 0 check (image_count >= 0),
  contains_real_person boolean,
  multi_person_detected boolean,
  real_person_count integer check (real_person_count is null or real_person_count >= 0),
  is_group_photo boolean,
  is_lifestyle_photo boolean,
  image_kind text,
  image_width integer check (image_width is null or image_width > 0),
  image_height integer check (image_height is null or image_height > 0),
  analysis_confidence numeric check (
    analysis_confidence is null or
    (analysis_confidence >= 0 and analysis_confidence <= 1)
  ),
  provider_request_id text,
  provider_error_code text,
  error_type text,
  retry_count integer not null default 0 check (retry_count >= 0),
  outcome text not null check (outcome in (
    'submitted', 'provider_accepted', 'provider_success', 'success',
    'provider_policy_blocked', 'asset_required', 'provider_error',
    'drive_sync_failed'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_provider_policy_events_owner_created_idx
  on public.video_provider_policy_events(owner_id, created_at desc);
create index if not exists video_provider_policy_events_outcome_created_idx
  on public.video_provider_policy_events(outcome, created_at desc);

alter table public.video_material_rights_confirmations enable row level security;
alter table public.video_provider_policy_events enable row level security;

drop policy if exists video_material_rights_select_policy
  on public.video_material_rights_confirmations;
create policy video_material_rights_select_policy
on public.video_material_rights_confirmations
for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.video_projects p
    where p.id = project_version_id and p.owner_id = (select auth.uid())
  )
);

drop policy if exists video_material_rights_insert_policy
  on public.video_material_rights_confirmations;
create policy video_material_rights_insert_policy
on public.video_material_rights_confirmations
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.video_projects p
    where p.id = project_version_id
      and p.owner_id = (select auth.uid())
      and p.version_root_id = project_id
  )
);

drop policy if exists video_provider_policy_events_select_policy
  on public.video_provider_policy_events;
create policy video_provider_policy_events_select_policy
on public.video_provider_policy_events
for select to authenticated
using (
  owner_id = (select auth.uid())
  or lower(coalesce((select auth.jwt())->>'email', '')) = any (
    array['davidxxu@webank.com', 'judyzzhang@webank.com']
  )
);

revoke all on table public.video_material_rights_confirmations from anon;
revoke all on table public.video_provider_policy_events from anon;
revoke all on table public.video_provider_policy_events from authenticated;
grant select, insert on table public.video_material_rights_confirmations to authenticated;
grant select on table public.video_provider_policy_events to authenticated;
grant all on table public.video_material_rights_confirmations to service_role;
grant all on table public.video_provider_policy_events to service_role;

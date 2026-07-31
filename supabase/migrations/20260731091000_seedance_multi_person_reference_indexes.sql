create index if not exists video_projects_version_source_idx
  on public.video_projects(version_source_project_id);
create index if not exists video_material_rights_project_idx
  on public.video_material_rights_confirmations(project_id);
create index if not exists video_material_rights_user_idx
  on public.video_material_rights_confirmations(user_id);

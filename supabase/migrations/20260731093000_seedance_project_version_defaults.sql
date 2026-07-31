-- Keep legacy project creation compatible while version-aware clients roll out.
create or replace function public.set_video_project_version_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.version_root_id is null then
    new.version_root_id := new.id;
  end if;

  if new.version_number is null or new.version_number < 1 then
    new.version_number := 1;
  end if;

  return new;
end;
$$;

drop trigger if exists set_video_project_version_defaults_before_insert
  on public.video_projects;

create trigger set_video_project_version_defaults_before_insert
before insert on public.video_projects
for each row
execute function public.set_video_project_version_defaults();

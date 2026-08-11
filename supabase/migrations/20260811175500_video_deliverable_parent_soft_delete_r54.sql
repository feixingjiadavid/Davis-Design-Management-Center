create or replace function public.r54_soft_delete_deliverables_with_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(old.status,'active')) <> 'deleted'
     and lower(coalesce(new.status,'active')) = 'deleted' then
    update public.video_deliverables
      set status = 'deleted', updated_at = now()
      where parent_group_id = new.id
        and owner_id = new.owner_id
        and status <> 'deleted';
  end if;
  return new;
end;
$$;

drop trigger if exists r54_soft_delete_deliverables_with_parent on public.video_project_groups;
create trigger r54_soft_delete_deliverables_with_parent
after update of status on public.video_project_groups
for each row execute function public.r54_soft_delete_deliverables_with_parent();
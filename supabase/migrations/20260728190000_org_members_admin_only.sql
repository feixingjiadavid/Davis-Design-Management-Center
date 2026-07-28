create or replace function public.is_system_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.role = 'admin'
      and coalesce(u.disabled, false) = false
  );
$$;

revoke all on function public.is_system_admin() from public;
revoke all on function public.is_system_admin() from anon;
grant execute on function public.is_system_admin() to authenticated;
grant execute on function public.is_system_admin() to service_role;

drop policy if exists org_members_select_allowed_users on public.org_members;
drop policy if exists org_members_insert_allowed_users on public.org_members;
drop policy if exists org_members_update_allowed_users on public.org_members;

create policy org_members_select_system_admins
on public.org_members
for select
to authenticated
using ((select public.is_system_admin()));

create policy org_members_insert_system_admins
on public.org_members
for insert
to authenticated
with check ((select public.is_system_admin()));

create policy org_members_update_system_admins
on public.org_members
for update
to authenticated
using ((select public.is_system_admin()))
with check ((select public.is_system_admin()));

drop policy if exists "AI designer and administrators can read AI jobs" on public.ai_design_jobs;
drop policy if exists "Only Davis AI account can read AI jobs" on public.ai_design_jobs;

create policy "Only Davis AI account can read AI jobs"
  on public.ai_design_jobs
  for select
  to authenticated
  using (auth.uid() = '90e5b8f9-c8b3-4d7c-9931-444e35b43b5b'::uuid);

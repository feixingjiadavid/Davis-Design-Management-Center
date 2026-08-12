alter table public.ai_design_jobs drop constraint if exists ai_design_jobs_status_check;
alter table public.ai_design_jobs add constraint ai_design_jobs_status_check
check (status in ('queued','analyzing','needs_input','ready_for_generation','framework_submitted','failed'));

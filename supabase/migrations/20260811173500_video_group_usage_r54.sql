create or replace function public.get_my_video_group_usage(p_group_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_group_id is null then raise exception 'GROUP_REQUIRED'; end if;

  with base as (
    select
      t.id,
      lower(coalesce(t.model_alias,'')) as alias,
      t.request_payload,
      t.provider_response,
      case when coalesce(t.provider_response #>> '{usage,total_tokens}','') ~ '^[0-9]+([.][0-9]+)?$'
        then (t.provider_response #>> '{usage,total_tokens}')::numeric else 0::numeric end as actual_tokens,
      (coalesce(t.request_payload #>> '{generate_audio}','false')='true') as generate_audio,
      (
        coalesce(t.request_payload #>> '{pricing_estimate,billing_input_mode}','')='with_video_input'
        or coalesce(t.request_payload #>> '{input_mode}','') like '%video%'
        or coalesce(t.request_payload #>> '{diagnostics,input_mode}','') like '%video%'
        or coalesce(t.request_payload -> 'reference_roles','[]'::jsonb) @> '["reference_video"]'::jsonb
      ) as has_video_input,
      case when coalesce(t.request_payload #>> '{pricing_estimate,rate_per_million_tokens_cny}','') ~ '^[0-9]+([.][0-9]+)?$'
        then (t.request_payload #>> '{pricing_estimate,rate_per_million_tokens_cny}')::numeric else null::numeric end as recorded_rate,
      case when coalesce(t.request_payload #>> '{duration}','') ~ '^[0-9]+([.][0-9]+)?$'
        then (t.request_payload #>> '{duration}')::numeric
        when coalesce(t.provider_response #>> '{duration}','') ~ '^[0-9]+([.][0-9]+)?$'
        then (t.provider_response #>> '{duration}')::numeric else 0::numeric end as duration_seconds
    from public.video_tasks t
    join public.video_projects p on p.id=t.project_id
    where t.owner_id=v_user
      and p.owner_id=v_user
      and p.parent_group_id=p_group_id
  ), priced as (
    select b.*,
      coalesce(b.recorded_rate,
        case
          when b.alias in ('v15','15','1.5') then case when b.generate_audio then 16 else 8 end
          when b.alias='fast' then case when b.has_video_input then 22 else 37 end
          when b.alias in ('v20','20','2.0','standard') then case when b.has_video_input then 28 else 46 end
          else case when b.has_video_input then 14 else 23 end
        end) as rate_per_million
    from base b
  ), calc as (
    select *, (actual_tokens*rate_per_million/1000000.0) as actual_cost_cny
    from priced
  )
  select jsonb_build_object(
    'group_id',p_group_id,
    'generated_tasks',count(*) filter (where actual_tokens>0),
    'tokens',coalesce(sum(actual_tokens) filter (where actual_tokens>0),0),
    'cost_cny',round(coalesce(sum(actual_cost_cny) filter (where actual_tokens>0),0),2),
    'generated_seconds',coalesce(sum(duration_seconds) filter (where actual_tokens>0),0),
    'basis','ark_usage_tokens_x_model_rate'
  ) into v_result
  from calc;

  return coalesce(v_result,jsonb_build_object('group_id',p_group_id,'generated_tasks',0,'tokens',0,'cost_cny',0,'generated_seconds',0,'basis','ark_usage_tokens_x_model_rate'));
end;
$$;

grant execute on function public.get_my_video_group_usage(uuid) to authenticated;
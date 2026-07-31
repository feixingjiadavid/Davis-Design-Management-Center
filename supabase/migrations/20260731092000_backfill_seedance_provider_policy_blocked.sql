update public.video_tasks
set
  status = 'provider_policy_blocked',
  error_message = '当前视频模型对该真人参考图片进行了安全限制。素材和项目已保存，你可以更换参考图片后重新生成。',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'image_count', coalesce(jsonb_array_length(coalesce(request_payload->'ark_payload'->'content', '[]'::jsonb)) - 1, 0),
    'contains_real_person', true,
    'multi_person_detected', null,
    'submit_mode', 'temporary_reference_person',
    'task_type', coalesce(request_payload->>'task_type', request_payload->>'generation_mode', 'temporary_person_reference_video'),
    'image_role', coalesce(request_payload->'image_roles'->>0, request_payload->'ark_payload'->'content'->1->>'role'),
    'provider_request_id', provider_response->>'ark_request_id',
    'provider_error_code', coalesce(provider_response->>'ark_provider_code', 'InputImageSensitiveContentDetected.PrivacyInformation'),
    'model', request_payload->>'model',
    'endpoint', request_payload->>'endpoint',
    'retry_count', 0
  ),
  provider_response = coalesce(provider_response, '{}'::jsonb) || jsonb_build_object(
    'final_status', 'provider_policy_blocked'
  ),
  updated_at = now()
where status = 'asset_auth_required';

update public.video_segments s
set status = 'provider_policy_blocked', updated_at = now()
where exists (
  select 1 from public.video_tasks t
  where t.segment_id = s.id and t.status = 'provider_policy_blocked'
);

insert into public.video_provider_policy_events (
  task_id, owner_id, provider, model, endpoint, submit_mode, task_type,
  image_role, image_count, contains_real_person, multi_person_detected,
  provider_request_id, provider_error_code, error_type, retry_count, outcome
)
select
  t.id,
  t.owner_id,
  'ark',
  coalesce(t.metadata->>'model', t.request_payload->>'model', 'doubao-seedance-2-0-mini-260615'),
  coalesce(t.metadata->>'endpoint', t.request_payload->>'endpoint', 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks'),
  'temporary_reference_person',
  coalesce(t.metadata->>'task_type', 'temporary_person_reference_video'),
  t.metadata->>'image_role',
  coalesce((t.metadata->>'image_count')::integer, 1),
  true,
  null,
  t.metadata->>'provider_request_id',
  coalesce(t.metadata->>'provider_error_code', 'InputImageSensitiveContentDetected.PrivacyInformation'),
  coalesce(t.metadata->>'provider_error_code', 'InputImageSensitiveContentDetected.PrivacyInformation'),
  0,
  'provider_policy_blocked'
from public.video_tasks t
where t.status = 'provider_policy_blocked'
on conflict (task_id) do update
set
  outcome = excluded.outcome,
  provider_request_id = excluded.provider_request_id,
  provider_error_code = excluded.provider_error_code,
  error_type = excluded.error_type,
  updated_at = now();

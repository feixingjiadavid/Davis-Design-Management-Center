import { normalizeArkResult } from './seedance-status-core.mjs';

const ACTIVE = new Set(['submitting', 'submitted', 'queued', 'running', 'processing']);

export async function syncTaskFromArk(task, arkPayload, adapter, nowIso = new Date().toISOString()) {
  const result = normalizeArkResult(arkPayload, task.progress);
  if (result.status === 'unknown' && ACTIVE.has(String(task.status || '').toLowerCase())) {
    result.status = task.status;
    result.progress = Number(task.progress || 0);
  }

  if (typeof adapter.persistResult === 'function') {
    const persisted = await adapter.persistResult(task, result, arkPayload, nowIso);
    let output = persisted.output_id ? { id: persisted.output_id } : null;
    if (result.status === 'succeeded' && result.videoUrl && output && typeof adapter.syncOutputToDrive === 'function') {
      const drive = await adapter.syncOutputToDrive(output.id, {
        task,
        providerTaskId: task.provider_task_id,
        videoUrl: result.videoUrl,
        arkPayload,
        nowIso,
      });
      output = { ...output, ...(drive || {}) };
    }
    return {
      ...result,
      status: persisted.status,
      progress: Number(persisted.progress),
      errorMessage: persisted.error_message || '',
      output,
    };
  }

  const taskPatch = {
    status: result.status,
    progress: result.progress,
    provider_response: arkPayload,
    updated_at: nowIso,
  };

  if (result.status === 'running' && !task.started_at) taskPatch.started_at = nowIso;
  if (result.status === 'failed') {
    taskPatch.error_message = result.errorMessage;
    taskPatch.completed_at = task.completed_at || nowIso;
  } else if (result.status === 'succeeded') {
    taskPatch.error_message = null;
    taskPatch.completed_at = task.completed_at || nowIso;
  }

  await adapter.updateTask(task.id, taskPatch);

  if (task.segment_id) {
    await adapter.updateSegment(task.segment_id, task.owner_id, {
      status: result.status,
      updated_at: nowIso,
    });
  }

  let output = null;
  if (result.status === 'succeeded' && result.videoUrl) {
    const metadata = {
      ark_response: arkPayload,
      provider_task_id: task.provider_task_id,
      provider_video_url: result.videoUrl,
      provider_video_url_refreshed_at: nowIso,
      storage_backend: 'google_drive_pending',
    };
    output = await adapter.findOutputByTaskId(task.id);

    if (output) {
      output = await adapter.updateOutput(output.id, {
        bucket_id: output.bucket_id || 'ark-url',
        status: output.status || 'pending',
        storage_status: output.storage_status || 'pending',
        storage_path: output.storage_path || ('ark://' + task.provider_task_id + '.mp4'),
        metadata: { ...(output.metadata || {}), ...metadata },
        storage_updated_at: nowIso,
      });
    } else {
      output = await adapter.insertOutput({
        owner_id: task.owner_id,
        task_id: task.id,
        project_id: task.project_id,
        segment_id: task.segment_id,
        bucket_id: 'ark-url',
        storage_path: 'ark://' + task.provider_task_id + '.mp4',
        metadata,
        status: 'pending',
        storage_status: 'pending',
        storage_updated_at: nowIso,
      });
    }
  }

  if (result.status === 'succeeded' && result.videoUrl && output && typeof adapter.syncOutputToDrive === 'function') {
    const drive = await adapter.syncOutputToDrive(output.id, {
      task,
      providerTaskId: task.provider_task_id,
      videoUrl: result.videoUrl,
      arkPayload,
      nowIso,
    });
    output = { ...output, ...(drive || {}) };
  }

  return { ...result, output };
}

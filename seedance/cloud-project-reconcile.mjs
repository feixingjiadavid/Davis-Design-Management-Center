import { listDrafts, saveDraft } from './db.js';
import { chooseGroupedProjectBinding, applyProjectBindingToDraft } from './grouped-project-binding.mjs';

export const CLOUD_RECONCILE_VERSION = '20260916-v1';

function text(value) {
  return String(value ?? '').trim();
}

function modeKey(value) {
  const mode = text(value);
  return mode === 'first_last' ? 'first_last' : (mode === 'text_only' ? 'text_only' : 'multi_frame');
}

function workspaceState(remoteProjectId = null, ownerId = null) {
  return {
    frames: [],
    segments: [],
    outputs: [],
    outputHistory: [],
    referenceVideo: null,
    referenceAssets: [],
    jobs: [],
    selectedSegmentId: null,
    remoteProjectId,
    bindingCandidateProjectId: remoteProjectId,
    remoteOwnerId: ownerId,
    ownerId,
    remoteBindingSchema: 'r5.3',
    remoteBindingVersion: 'r5.3',
    remoteBindingLocked: Boolean(remoteProjectId),
    cloudSyncedAt: 0,
    lastEmptySyncAt: 0,
  };
}

function resolutionSize(ratio) {
  const value = text(ratio) || '16:9';
  if (value === '9:16') return { width: 1080, height: 1920 };
  if (value === '1:1') return { width: 1080, height: 1080 };
  if (value === '4:3') return { width: 1440, height: 1080 };
  if (value === '3:4') return { width: 1080, height: 1440 };
  return { width: 1920, height: 1080 };
}

export function cloudDraftFromProject(project, ownerId) {
  const projectId = text(project?.id);
  const mode = modeKey(project?.mode);
  const taskName = text(project?.task_name || project?.taskName || project?.name) || '云端任务';
  const ratio = text(project?.ratio) || '16:9';
  const size = resolutionSize(ratio);
  const createdAt = Date.parse(text(project?.created_at)) || Date.now();
  const updatedAt = Date.parse(text(project?.updated_at)) || createdAt;
  const workspaces = {
    first_last: workspaceState(null, ownerId),
    multi_frame: workspaceState(null, ownerId),
    text_only: workspaceState(null, ownerId),
  };
  workspaces[mode] = workspaceState(projectId, ownerId);

  return {
    id: `cloud-${projectId}`,
    name: taskName,
    mode,
    lockedMode: mode,
    projectModeLocked: true,
    singleModeVersion: 'r5',
    ratio,
    finalWidth: size.width,
    finalHeight: size.height,
    fitMode: text(project?.frame_fit_mode) || 'contain',
    createdAt,
    updatedAt,
    ownerId,
    remoteOwnerId: ownerId,
    remoteProjectId: projectId,
    remoteProjectName: text(project?.name) || taskName,
    projectCategory: text(project?.project_category),
    parentGroupId: text(project?.parent_group_id) || null,
    parent_group_id: text(project?.parent_group_id) || null,
    taskName,
    task_name: taskName,
    taskOrder: Number(project?.task_order || 0),
    cloudRecoveredProject: true,
    workspaces,
    frames: workspaces[mode].frames,
    segments: workspaces[mode].segments,
    selectedSegmentId: null,
  };
}

function ownerOfDraft(draft) {
  const mode = modeKey(draft?.lockedMode || draft?.mode);
  const workspace = draft?.workspaces?.[mode] || {};
  return text(draft?.remoteOwnerId || draft?.ownerId || workspace.remoteOwnerId || workspace.ownerId);
}

function remoteIdsOfDraft(draft) {
  const ids = new Set();
  const add = value => { const id = text(value); if (id) ids.add(id); };
  add(draft?.remoteProjectId);
  for (const workspace of Object.values(draft?.workspaces || {})) {
    add(workspace?.remoteProjectId);
    add(workspace?.bindingCandidateProjectId);
  }
  return ids;
}

function canRepairOwnerlessDraft(draft, project) {
  const draftGroup = text(draft?.parentGroupId || draft?.parent_group_id);
  const projectGroup = text(project?.parent_group_id || project?.parentGroupId);
  if (draftGroup && projectGroup && draftGroup === projectGroup) return true;
  const draftIds = remoteIdsOfDraft(draft);
  return draftIds.has(text(project?.id));
}

export async function prepareCloudProjectCache(supabase) {
  if (!supabase) return { repaired: 0, created: 0, projects: 0 };
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = text(sessionData?.session?.user?.id);
  if (!userId) return { repaired: 0, created: 0, projects: 0 };

  const { data: projectsData, error } = await supabase
    .from('video_projects')
    .select('id,name,mode,owner_id,project_category,parent_group_id,task_name,task_order,ratio,resolution,frame_fit_mode,status,created_at,updated_at')
    .eq('owner_id', userId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.warn('[Davis Video cloud reconcile] project read failed', error);
    return { repaired: 0, created: 0, projects: 0, error };
  }

  const projects = Array.isArray(projectsData) ? projectsData : [];
  const localDrafts = await listDrafts().catch(error => {
    console.warn('[Davis Video cloud reconcile] local draft read failed', error);
    return [];
  });

  const usedProjectIds = new Set();
  let repaired = 0;
  let created = 0;

  for (const draft of localDrafts) {
    if (!draft || draft.deleted) continue;
    const owner = ownerOfDraft(draft);
    const candidate = chooseGroupedProjectBinding(draft, projects);
    if (!candidate) continue;
    if (owner && owner !== userId) continue;
    if (!owner && !canRepairOwnerlessDraft(draft, candidate)) continue;

    const changed = applyProjectBindingToDraft(draft, candidate);
    usedProjectIds.add(text(candidate.id));
    if (changed) {
      await saveDraft(draft);
      repaired += 1;
    }
  }

  for (const draft of localDrafts) {
    if (!draft || draft.deleted) continue;
    if (ownerOfDraft(draft) !== userId) continue;
    for (const id of remoteIdsOfDraft(draft)) usedProjectIds.add(id);
  }

  for (const project of projects) {
    const projectId = text(project?.id);
    if (!projectId || usedProjectIds.has(projectId)) continue;

    const deterministicId = `cloud-${projectId}`;
    const cached = localDrafts.find(draft => text(draft?.id) === deterministicId);
    if (cached) {
      const changed = applyProjectBindingToDraft(cached, project);
      if (changed) {
        await saveDraft(cached);
        repaired += 1;
      }
    } else {
      await saveDraft(cloudDraftFromProject(project, userId));
      created += 1;
    }
    usedProjectIds.add(projectId);
  }

  return { repaired, created, projects: projects.length };
}

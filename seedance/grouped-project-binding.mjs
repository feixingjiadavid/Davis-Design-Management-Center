function text(value) {
  return String(value ?? '').trim();
}

function modeKey(value) {
  const mode = text(value);
  return mode === 'first_last' ? 'first_last' : (mode === 'text_only' ? 'text_only' : 'multi_frame');
}

function localTaskName(draft) {
  return text(draft?.taskName || draft?.task_name || draft?.name);
}

function localParentGroupId(draft) {
  return text(draft?.parentGroupId || draft?.parent_group_id);
}

function activeWorkspace(draft) {
  if (!draft) return null;
  const mode = modeKey(draft.lockedMode || draft.mode);
  draft.workspaces ||= {};
  draft.workspaces[mode] ||= {};
  return draft.workspaces[mode];
}

export function chooseGroupedProjectBinding(draft, projects = []) {
  if (!draft) return null;
  const workspace = draft.workspaces?.[modeKey(draft.lockedMode || draft.mode)] || {};
  const existingId = text(workspace.remoteProjectId || draft.remoteProjectId || workspace.bindingCandidateProjectId);
  const wantedMode = modeKey(draft.lockedMode || draft.mode);
  const wantedTask = localTaskName(draft);
  const wantedParent = localParentGroupId(draft);
  const localCreatedAt = Number(draft.createdAt || draft.updatedAt || 0);

  const eligible = (projects || []).filter(project =>
    project && text(project.status).toLowerCase() !== 'deleted' && modeKey(project.mode) === wantedMode
  );

  if (existingId) {
    const exact = eligible.find(project => text(project.id) === existingId);
    if (exact) return exact;
  }

  const scored = eligible.map(project => {
    const projectTask = text(project.task_name || project.taskName);
    const projectParent = text(project.parent_group_id || project.parentGroupId);
    const projectName = text(project.name);
    let score = 0;

    if (wantedTask && projectTask === wantedTask) score += 1_000_000;
    if (wantedParent && projectParent === wantedParent) score += 10_000_000;
    if (wantedTask && projectName === wantedTask) score += 100_000;
    if (wantedTask && projectName.endsWith(` · ${wantedTask}`)) score += 50_000;

    const remoteCreatedAt = Date.parse(text(project.created_at || project.createdAt));
    if (localCreatedAt && Number.isFinite(remoteCreatedAt)) {
      score -= Math.min(Math.abs(remoteCreatedAt - localCreatedAt) / 1000, 20_000);
    }
    return { project, score, projectTask, projectParent, projectName };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  const best = scored[0];
  const second = scored[1];
  const decisive =
    (wantedParent && best.projectParent === wantedParent) ||
    (wantedTask && best.projectTask === wantedTask && (!second || second.projectTask !== wantedTask)) ||
    !second || best.score - second.score >= 25_000;

  return decisive ? best.project : null;
}

export function applyProjectBindingToDraft(draft, project) {
  if (!draft || !project?.id) return false;
  const workspace = activeWorkspace(draft);
  if (!workspace) return false;
  let changed = false;
  const set = (target, key, value) => {
    if (value == null || value === '') return;
    if (target[key] !== value) {
      target[key] = value;
      changed = true;
    }
  };

  const ownerId = text(project.owner_id || project.ownerId);
  const projectId = text(project.id);
  const parentGroupId = text(project.parent_group_id || project.parentGroupId);
  const taskName = text(project.task_name || project.taskName);
  const category = text(project.project_category || project.projectCategory);

  set(draft, 'remoteProjectId', projectId);
  set(draft, 'remoteOwnerId', ownerId);
  set(draft, 'ownerId', ownerId);
  set(draft, 'remoteProjectName', text(project.name));
  set(draft, 'parentGroupId', parentGroupId);
  set(draft, 'taskName', taskName);
  set(draft, 'projectCategory', category);

  set(workspace, 'remoteProjectId', projectId);
  set(workspace, 'bindingCandidateProjectId', projectId);
  set(workspace, 'remoteOwnerId', ownerId);
  set(workspace, 'ownerId', ownerId);
  set(workspace, 'remoteBindingSchema', 'r5.3');
  set(workspace, 'remoteBindingVersion', 'r5.3');
  if (workspace.remoteBindingLocked !== true) {
    workspace.remoteBindingLocked = true;
    changed = true;
  }
  if (workspace.cloudSyncedAt !== 0) {
    workspace.cloudSyncedAt = 0;
    changed = true;
  }
  if (workspace.lastEmptySyncAt !== 0) {
    workspace.lastEmptySyncAt = 0;
    changed = true;
  }
  return changed;
}

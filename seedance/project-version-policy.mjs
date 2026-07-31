function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cloneValue(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function parseProjectVersion(name) {
  const normalized = cleanName(name) || '未命名 Seedance 项目';
  const match = normalized.match(/^(.*?)\s+V-(\d+)$/iu);
  if (!match || !cleanName(match[1])) return { baseName: normalized, version: 1 };
  const version = Math.max(1, Number(match[2]) || 1);
  return { baseName: cleanName(match[1]), version };
}

export function nextProjectVersionName(currentName, existingNames = []) {
  const { baseName, version: currentVersion } = parseProjectVersion(currentName);
  let maxVersion = Math.max(1, currentVersion);
  for (const name of existingNames || []) {
    const parsed = parseProjectVersion(name);
    if (parsed.baseName === baseName) maxVersion = Math.max(maxVersion, parsed.version);
  }
  return `${baseName} V-${maxVersion + 1}`;
}

function clearUploadBinding(asset) {
  if (!asset || typeof asset !== 'object') return asset;
  asset.remoteAssetId = null;
  asset.remotePath = null;
  asset.arkSafeVersion = null;
  asset.wasAspectPadded = false;
  asset.uploadWidth = null;
  asset.uploadHeight = null;
  asset.uploadSafeRatio = null;
  asset.originalRatio = null;
  asset.aspectPadMode = null;
  return asset;
}

function resetSegment(segment) {
  if (!segment || typeof segment !== 'object') return segment;
  segment.status = 'draft';
  segment.progress = 0;
  segment.error = null;
  segment.remoteTaskId = null;
  segment.providerTaskId = null;
  segment.remoteSegmentId = null;
  segment.outputPath = null;
  segment.outputUrl = null;
  segment.outputId = null;
  segment.googleDriveFileId = null;
  segment.googleDriveUrl = null;
  segment.storageStatus = null;
  segment.submittedAt = null;
  segment.completedAt = null;
  return segment;
}

function resetWorkspace(workspace) {
  if (!workspace || typeof workspace !== 'object') return workspace;
  workspace.remoteProjectId = null;
  workspace.bindingCandidateProjectId = null;
  workspace.remoteBindingLocked = false;
  workspace.remoteBindingVersion = null;
  workspace.cloudSyncedAt = 0;
  workspace.lastEmptySyncAt = 0;
  workspace.outputs = [];
  workspace.outputHistory = [];
  workspace.jobs = [];
  (workspace.frames || []).forEach(clearUploadBinding);
  (workspace.referenceAssets || []).forEach(clearUploadBinding);
  if (workspace.referenceVideo) clearUploadBinding(workspace.referenceVideo);
  (workspace.segments || []).forEach(resetSegment);
  return workspace;
}

export function cloneDraftAsVersion(sourceDraft, nextName, idFactory, now = Date.now()) {
  if (!sourceDraft || typeof sourceDraft !== 'object') throw new TypeError('sourceDraft is required');
  if (typeof idFactory !== 'function') throw new TypeError('idFactory is required');
  const draft = cloneValue(sourceDraft);
  const sourceId = sourceDraft.id || null;
  const version = parseProjectVersion(nextName).version;
  draft.id = idFactory();
  draft.name = cleanName(nextName);
  draft.remoteProjectName = draft.name;
  draft.createdAt = Number(now);
  draft.updatedAt = Number(now);
  draft.remoteProjectId = null;
  draft.versionSourceDraftId = sourceId;
  draft.versionNumber = version;
  draft.pendingVersionFork = null;
  // A new project version may contain changed material, so rights confirmation
  // is intentionally scoped to and reset for the new version.
  draft.materialRightsConfirmation = null;
  draft.materialRightsConfirmedAt = null;
  draft.outputs = [];
  draft.outputHistory = [];
  draft.jobs = [];

  if (draft.workspaces && typeof draft.workspaces === 'object') {
    Object.values(draft.workspaces).forEach(resetWorkspace);
  }
  resetWorkspace(draft);

  const mode = draft.lockedMode || draft.mode;
  const workspace = draft.workspaces?.[mode];
  if (workspace) {
    draft.frames = workspace.frames;
    draft.segments = workspace.segments;
    draft.selectedSegmentId = workspace.selectedSegmentId || workspace.segments?.[0]?.id || null;
  }
  return draft;
}

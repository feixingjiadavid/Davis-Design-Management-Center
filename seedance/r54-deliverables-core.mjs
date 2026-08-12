export const REVIEW_STATUSES = Object.freeze([
  'draft',
  'pending_review',
  'accepted',
  'backup',
  'rejected',
  'needs_retry',
]);

const REVIEW_STATUS_SET = new Set(REVIEW_STATUSES);
const MODE_ALIASES = new Map([
  ['first_last', 'first_last'],
  ['首尾帧', 'first_last'],
  ['首尾帧生成', 'first_last'],
  ['multi_frame', 'multi_frame'],
  ['多帧', 'multi_frame'],
  ['多帧 storyboard', 'multi_frame'],
  ['多帧storyboard', 'multi_frame'],
  ['text_only', 'text_only'],
  ['纯文字', 'text_only'],
  ['纯文字生成', 'text_only'],
]);
const MODEL_ALIASES = new Map([
  ['v20', 'v20'],
  ['seedance 2.0', 'v20'],
  ['doubao-seedance-2-0', 'v20'],
  ['fast', 'fast'],
  ['seedance 2.0 fast', 'fast'],
  ['mini', 'mini'],
  ['seedance 2.0 mini', 'mini'],
  ['v15', 'v15'],
  ['seedance 1.5 pro', 'v15'],
]);
const RESOLUTION_ALIASES = new Map([
  ['480p', '480p'],
  ['720p', '720p'],
  ['1080p', '1080p'],
  ['4k', '4k'],
]);

function text(value) {
  return String(value ?? '').trim();
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function normalizeReviewStatus(value) {
  const normalized = text(value).toLowerCase();
  return REVIEW_STATUS_SET.has(normalized) ? normalized : 'draft';
}

export function resolveDraftReviewStatus({ draftStatus, cloudStatus, remoteShareCount = 0 } = {}) {
  const explicit = text(draftStatus);
  if (explicit) return normalizeReviewStatus(explicit);
  const shares = Math.max(0, Number(remoteShareCount) || 0);
  if (shares > 1) return 'draft';
  if (shares === 1) return normalizeReviewStatus(cloudStatus);
  return 'draft';
}

export function normalizeMode(value) {
  const normalized = text(value).toLowerCase();
  return MODE_ALIASES.get(normalized) || '';
}

export function normalizeModelAlias(value) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return 'mini';
  return MODEL_ALIASES.get(normalized) || '';
}

export function normalizeResolution(value) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return '720p';
  return RESOLUTION_ALIASES.get(normalized) || '';
}

export function groupTasksByDeliverable(tasks = [], deliverables = []) {
  const activeDeliverables = (Array.isArray(deliverables) ? deliverables : [])
    .filter(item => item && String(item.status || 'active').toLowerCase() !== 'deleted')
    .slice()
    .sort((a, b) => {
      const order = Number(a.sort_order ?? a.sortOrder ?? 0) - Number(b.sort_order ?? b.sortOrder ?? 0);
      if (order) return order;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
    });

  const sectionById = new Map(activeDeliverables.map(deliverable => [
    String(deliverable.id),
    { ...deliverable, tasks: [] },
  ]));
  const unclassified = [];

  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!task || String(task.status || 'active').toLowerCase() === 'deleted') continue;
    const deliverableId = text(task.deliverable_id ?? task.deliverableId);
    const section = deliverableId ? sectionById.get(deliverableId) : null;
    if (section) section.tasks.push(task);
    else unclassified.push(task);
  }

  const sortTasks = list => list.sort((a, b) => {
    const order = Number(a.task_order ?? a.taskOrder ?? 0) - Number(b.task_order ?? b.taskOrder ?? 0);
    if (order) return order;
    const aTime = new Date(a.created_at || a.createdAt || 0).getTime();
    const bTime = new Date(b.created_at || b.createdAt || 0).getTime();
    return aTime - bTime;
  });

  const sections = activeDeliverables.map(item => {
    const section = sectionById.get(String(item.id));
    sortTasks(section.tasks);
    return section;
  });
  sortTasks(unclassified);
  return { sections, unclassified };
}

export function validateBatchRows(rows = []) {
  const input = Array.isArray(rows) ? rows : [];
  const normalizedRows = input.map((row, index) => {
    const taskName = text(row?.taskName ?? row?.task_name ?? row?.['任务名称']);
    const subjectKey = text(row?.subjectKey ?? row?.subject_key ?? row?.['subject_key'] ?? row?.['对象标识']);
    const mode = normalizeMode(row?.mode ?? row?.['生成模式'] ?? row?.['模式']);
    const oldPhoto = text(row?.oldPhoto ?? row?.old_photo ?? row?.['历史照片'] ?? row?.['旧照片']);
    const currentPhoto = text(row?.currentPhoto ?? row?.current_photo ?? row?.['当前照片'] ?? row?.['现在照片']);
    const rawModel = text(row?.model ?? row?.['模型']);
    const rawResolution = text(row?.resolution ?? row?.['清晰度'] ?? row?.['分辨率']);
    return {
      index,
      source: row || {},
      taskName,
      subjectKey,
      mode,
      oldPhoto,
      currentPhoto,
      prompt: text(row?.prompt ?? row?.['提示词'] ?? row?.['动作模板']),
      model: normalizeModelAlias(rawModel),
      rawModel,
      duration: text(row?.duration ?? row?.['时长']),
      resolution: normalizeResolution(rawResolution),
      rawResolution,
      ratio: text(row?.ratio ?? row?.['比例']),
    };
  });

  const subjectCounts = new Map();
  for (const row of normalizedRows) {
    if (!row.subjectKey) continue;
    subjectCounts.set(row.subjectKey, (subjectCounts.get(row.subjectKey) || 0) + 1);
  }

  const valid = [];
  const invalid = [];
  for (const row of normalizedRows) {
    const errors = [];
    if (!row.taskName) errors.push('任务名称不能为空');
    if (!row.subjectKey) errors.push('subject_key 不能为空');
    if (!row.mode) errors.push('生成模式无效，请使用首尾帧 / 多帧 Storyboard / 纯文字');
    if (row.rawModel && !row.model) errors.push('模型名称无效，请使用 Seedance 2.0 / Seedance 2.0 Fast / Seedance 2.0 Mini / Seedance 1.5 Pro');
    if (row.rawResolution && !row.resolution) errors.push('分辨率无效，请使用 480P / 720P / 1080P / 4K');
    if (row.subjectKey && subjectCounts.get(row.subjectKey) > 1) errors.push('subject_key 在本次导入中重复');
    if (row.mode === 'first_last' && !row.oldPhoto) errors.push('首尾帧任务缺少历史照片');
    if (row.mode === 'first_last' && !row.currentPhoto) errors.push('首尾帧任务缺少当前照片');

    const normalized = {
      taskName: row.taskName,
      subjectKey: row.subjectKey,
      mode: row.mode,
      oldPhoto: row.oldPhoto,
      currentPhoto: row.currentPhoto,
      prompt: row.prompt,
      model: row.model || 'mini',
      duration: row.duration,
      resolution: row.resolution || '720p',
      ratio: row.ratio,
    };
    if (errors.length) invalid.push({ index: row.index, row: row.source, normalized, errors });
    else valid.push({ index: row.index, row: row.source, normalized });
  }

  return { valid, invalid, total: normalizedRows.length };
}

export function nextAttemptNo(tasks = [], subjectKey, deliverableId) {
  const subject = text(subjectKey);
  const deliverable = text(deliverableId);
  let maxAttempt = 0;
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (text(task?.subject_key ?? task?.subjectKey) !== subject) continue;
    if (text(task?.deliverable_id ?? task?.deliverableId) !== deliverable) continue;
    const attempt = Math.max(0, Number(task?.attempt_no ?? task?.attemptNo ?? 1) || 0);
    if (attempt > maxAttempt) maxAttempt = attempt;
  }
  return maxAttempt + 1;
}

export function parseEstimatedRmb(value) {
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/[¥￥]\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replaceAll(',', ''));
  return Number.isFinite(parsed) && parsed >= 0 ? money(parsed) : null;
}

export function buildPaidConfirmation(items = [], currentProjectSpend = 0) {
  const normalizedItems = (Array.isArray(items) ? items : []).map((item, index) => ({
    name: text(item?.name) || `任务 ${index + 1}`,
    estimateRmb: item?.estimateRmb == null ? null : Number(item.estimateRmb),
  }));
  const invalid = normalizedItems.filter(item => !Number.isFinite(item.estimateRmb) || item.estimateRmb < 0);
  if (!normalizedItems.length || invalid.length) {
    return {
      ok: false,
      count: normalizedItems.length,
      items: normalizedItems,
      incrementalTotal: null,
      projectAfterTotal: null,
      confirmLabel: '',
    };
  }

  const incrementalTotal = money(normalizedItems.reduce((sum, item) => sum + item.estimateRmb, 0));
  const projectSpend = Number.isFinite(Number(currentProjectSpend)) ? Number(currentProjectSpend) : 0;
  const projectAfterTotal = money(projectSpend + incrementalTotal);
  return {
    ok: true,
    count: normalizedItems.length,
    items: normalizedItems,
    incrementalTotal,
    projectAfterTotal,
    confirmLabel: `确认生成 ${normalizedItems.length} 项 · ¥${incrementalTotal.toFixed(2)}`,
  };
}

export function parseCsvText(csvText) {
  const source = String(csvText ?? '').replace(/^\uFEFF/, '');
  if (!source.trim()) return [];
  const matrix = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field.trim());
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field.trim());
      field = '';
      if (row.some(value => value !== '')) matrix.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some(value => value !== '')) matrix.push(row);
  if (!matrix.length) return [];

  const headers = matrix.shift().map((header, index) => text(header) || `column_${index + 1}`);
  return matrix.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

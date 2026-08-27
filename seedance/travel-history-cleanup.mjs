export const TRAVEL_HISTORY_CLEANUP_VERSION = '20260827-v1';

// Historical cloud projects whose generated content is explicitly about travel.
// Keep this list exact so future travel projects remain supported after the one-time cleanup.
export const TRAVEL_GENERATION_PROJECT_IDS = new Set([
  '81c74ad2-28f5-4822-8471-a0aee4a1c249',
  '585a72b0-53f8-4b6b-be13-9ecba73569fe',
  'b345c5ab-f881-423a-a67d-d48c270bb12f',
  '6bf6e6c1-d51a-4812-82ae-01872493d243',
  'fa94b9ac-f3ec-41a2-b8b8-5406508a7a6c',
  '6f9f846b-fb3d-4d55-adc5-bea1ce3efad3',
  '42bf198d-0d12-4058-8510-adb130d622bf',
  'a40e0c50-a2b7-47ef-8516-cabb0545e5d0',
  'ecca5089-2c91-47b2-a538-e12c7b00f7db',
  '15ecd6ed-3460-4e53-8ccc-8f8b7f071962',
  '84ba24d9-a811-463e-a1c9-c711fd5628d8',
  '2bb758f0-33a4-4f5a-a9c8-402be90f11a2',
  'f365105d-e54c-4dcc-b451-4e1f5627578a',
  '2b606d13-1c6a-4c0e-912b-f160e47ff36b',
  'cbeb6b6f-c315-4aa6-88cc-8094e866ce38',
  '17c9b903-2699-4a32-8aec-a085dbd45c13',
  '10073b7b-c257-428c-9245-8905a1663519',
  '0538121d-669f-4a1a-b904-28220ef377a7',
  '37763b8f-3010-4c72-8d54-d4b491a49447',
  '79632d16-5fff-4a06-b367-b6807d87f13e',
  '8b694a4f-3e82-4724-9f39-31e1ee3d1e83',
  '9408c0a8-781a-4575-ad22-5edb12c2937a',
  '43e3df77-4fe2-4927-84e7-9729a8e8603b',
  'd4034857-5cdd-4739-afad-c4d6bc10077e',
  'bc419ec8-4d20-40f1-acd5-199d3783b499',
  '6d85ee7c-5d23-4c94-9ac5-b5ba57e0aa8a',
  'e28c6968-c374-4e08-8620-7eba4d479b5e',
  'b940e036-9c5d-44f3-aebb-5c08c7d40e76',
  'cec08355-a825-422e-9cc1-df9615060713',
]);

const TRAVEL_CONTENT_PATTERN = /(旅行|旅游|旅拍|冰岛|阿克雷里|斯蒂基斯霍尔米|候机|机场|航班|酒店|度假|行程|景点|travel|tourism|trip|journey|vacation|iceland|akureyri|stykkish)/i;

function workspaceValues(draft) {
  return [draft, ...Object.values(draft?.workspaces || {})].filter(Boolean);
}

function remoteProjectIds(draft) {
  const ids = new Set();
  for (const value of workspaceValues(draft)) {
    for (const key of [
      'remoteProjectId',
      'bindingCandidateProjectId',
      'versionRootProjectId',
      'versionSourceProjectId',
      'retryOfProjectId',
    ]) {
      if (value?.[key]) ids.add(String(value[key]));
    }
  }
  return ids;
}

function searchableDraftText(draft) {
  const parts = [];
  const push = value => {
    if (typeof value === 'string' && value.trim()) parts.push(value);
  };

  for (const value of workspaceValues(draft)) {
    push(value?.name);
    push(value?.taskName);
    push(value?.task_name);
    push(value?.projectCategory);
    push(value?.project_category);

    for (const segment of value?.segments || []) push(segment?.prompt);
    for (const frame of value?.frames || []) {
      push(frame?.name);
      push(frame?.originalName);
      push(frame?.original_name);
    }
    for (const asset of value?.referenceAssets || []) {
      push(asset?.name);
      push(asset?.originalName);
      push(asset?.original_name);
    }
  }

  return parts.join(' ');
}

export function isKnownTravelGenerationDraft(draft) {
  for (const id of remoteProjectIds(draft)) {
    if (TRAVEL_GENERATION_PROJECT_IDS.has(id)) return true;
  }
  return false;
}

export function isTravelGenerationDraft(draft) {
  return isKnownTravelGenerationDraft(draft)
    || TRAVEL_CONTENT_PATTERN.test(searchableDraftText(draft));
}

export function filterTravelGenerationDrafts(drafts) {
  const kept = [];
  const removed = [];
  for (const draft of Array.isArray(drafts) ? drafts : []) {
    (isTravelGenerationDraft(draft) ? removed : kept).push(draft);
  }
  return { kept, removed };
}

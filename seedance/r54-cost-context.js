import { supabase } from '../supabase-config.js';
import { listDrafts } from './db.js';
import { parseEstimatedRmb } from './r54-deliverables-core.mjs';

const LAST_SELECTED_DRAFT_KEY = 'seedance_last_selected_draft_id_v1';
let requestSerial = 0;

function selectedDraftId() {
  return document.querySelector('.project-child.active')?.dataset?.project
    || localStorage.getItem(LAST_SELECTED_DRAFT_KEY)
    || '';
}

function groupIdForDraft(draft) {
  return String(draft?.parentGroupId || draft?.parent_group_id || '').trim() || null;
}

async function currentGroupId() {
  const id = selectedDraftId();
  if (!id) return null;
  const drafts = await listDrafts();
  const draft = drafts.find(item => String(item.id) === String(id));
  return groupIdForDraft(draft);
}

function formatMoney(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

async function renderCostContext() {
  const modal = document.getElementById('r54-paid');
  const body = document.getElementById('r54-paid-body');
  if (!modal || modal.hidden || !body) return;
  const serial = ++requestSerial;

  let box = document.getElementById('r54-group-cost-context');
  if (!box) {
    box = document.createElement('div');
    box.id = 'r54-group-cost-context';
    box.style.cssText = 'margin-top:10px;padding:10px 12px;border:1px solid #e9ecf5;border-radius:10px;background:#fff;color:#667085;font-size:11px;line-height:1.65';
    body.appendChild(box);
  }
  box.textContent = '正在读取当前一级项目累计费用…';

  try {
    const groupId = await currentGroupId();
    if (serial !== requestSerial || !groupId) {
      if (serial === requestSerial) box.textContent = '当前任务未绑定一级项目，暂不显示项目累计费用。';
      return;
    }
    const { data, error } = await supabase.rpc('get_my_video_group_usage', { p_group_id:groupId });
    if (error) throw error;
    if (serial !== requestSerial) return;

    const incremental = parseEstimatedRmb(body.querySelector('.r54-paid strong')?.textContent || '');
    const spent = Number(data?.cost_cny || 0);
    const after = incremental === null ? null : spent + incremental;
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px"><span>当前一级项目已产生费用</span><strong style="color:#30384b">${formatMoney(spent)}</strong></div>
      <div style="display:flex;justify-content:space-between;gap:12px"><span>本次确认后预计累计</span><strong style="color:#4657dc">${after === null ? '—' : formatMoney(after)}</strong></div>
      <div style="margin-top:4px;color:#98a0b2">已产生费用按 Ark usage.total_tokens × 对应模型真实费率统计；最终账单仍以火山方舟为准。</div>`;
  } catch (error) {
    if (serial !== requestSerial) return;
    box.textContent = `项目累计费用读取失败：${error?.message || String(error)}。本次新增费用仍以确认弹窗上方金额为准。`;
  }
}

function init() {
  const modal = document.getElementById('r54-paid');
  if (!modal) return;
  const observer = new MutationObserver(() => {
    if (!modal.hidden) queueMicrotask(() => { void renderCostContext(); });
  });
  observer.observe(modal, { attributes:true, attributeFilter:['hidden'], childList:true, subtree:true });
  document.body.dataset.davisVideoCostContextR54 = 'ready';
  console.log('[Davis Video R54] project cost context ready');
}

export function initCostContextR54() {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
}

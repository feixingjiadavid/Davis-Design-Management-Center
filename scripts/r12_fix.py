from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)

# Idempotency guard.
app_path = Path('seedance/app.js')
if 'function r50ApplySelectedTaskDom(' in app_path.read_text():
    print('R12 already applied')
    raise SystemExit(0)

core_path = Path('seedance/r54-deliverables-core.mjs')
core = core_path.read_text()
needle = "export function normalizeReviewStatus(value) {\n  const normalized = text(value).toLowerCase();\n  return REVIEW_STATUS_SET.has(normalized) ? normalized : 'draft';\n}\n"
addition = needle + "\nexport function resolveDraftReviewStatus({ draftStatus, cloudStatus, remoteShareCount = 0 } = {}) {\n  const explicit = text(draftStatus);\n  if (explicit) return normalizeReviewStatus(explicit);\n  const shares = Math.max(0, Number(remoteShareCount) || 0);\n  if (shares > 1) return 'draft';\n  if (shares === 1) return normalizeReviewStatus(cloudStatus);\n  return 'draft';\n}\n"
core = replace_once(core, needle, addition, 'core resolveDraftReviewStatus')
core_path.write_text(core)

r54_path = Path('seedance/r54-deliverables.js')
r54 = r54_path.read_text()
r54 = replace_once(r54, "  normalizeReviewStatus,\n  validateBatchRows,", "  normalizeReviewStatus,\n  resolveDraftReviewStatus,\n  validateBatchRows,", 'r54 import')
r54 = replace_once(r54, "function remoteProjectId(draft) { const w=workspaceOf(draft); return text(w?.remoteProjectId || draft?.remoteProjectId || w?.bindingCandidateProjectId) || null; }\n", "function remoteProjectId(draft) { const w=workspaceOf(draft); return text(w?.remoteProjectId || draft?.remoteProjectId || w?.bindingCandidateProjectId) || null; }\nfunction remoteProjectShareCount(remoteId) { const rid=text(remoteId); if(!rid)return 0; let count=0; for(const item of state.drafts){if(String(remoteProjectId(item)||'')===rid)count++;} return count; }\n", 'r54 share count')
r54 = replace_once(r54, "    reviewStatus:normalizeReviewStatus(draft?.reviewStatus || draft?.review_status || cloud?.review_status),", "    reviewStatus:resolveDraftReviewStatus({draftStatus:draft?.reviewStatus ?? draft?.review_status,cloudStatus:cloud?.review_status,remoteShareCount:remoteProjectShareCount(cloudId)}),", 'r54 draftMeta')
old_set = "async function setReview(localId,status){const draft=state.draftById.get(String(localId));if(!draft)return;const next=normalizeReviewStatus(status);draft.reviewStatus=next;draft.review_status=next;await saveDraft(draft);const rid=remoteProjectId(draft);if(rid){const result=await supabase.from('video_projects').update({review_status:next,updated_at:new Date().toISOString()}).eq('id',rid).eq('owner_id',state.user.id);if(result.error)return toast('状态同步失败',errorMessage(result.error));}toast(next==='needs_retry'?'已标记需重做':'审核状态已更新',next==='needs_retry'?'这里只做人工标记，不会自动重新生成，也不会产生费用。':REVIEW_LABELS[next]);const cloud=rid?state.projectById.get(String(rid)):null;if(cloud)cloud.review_status=next;}"
new_set = "async function setReview(localId,status){const draft=state.draftById.get(String(localId));if(!draft)return;const next=normalizeReviewStatus(status);draft.reviewStatus=next;draft.review_status=next;await saveDraft(draft);const rid=remoteProjectId(draft),shareCount=remoteProjectShareCount(rid);if(rid&&shareCount<=1){const result=await supabase.from('video_projects').update({review_status:next,updated_at:new Date().toISOString()}).eq('id',rid).eq('owner_id',state.user.id);if(result.error)return toast('状态同步失败',errorMessage(result.error));const cloud=state.projectById.get(String(rid));if(cloud)cloud.review_status=next;}toast(next==='needs_retry'?'已标记需重做':'审核状态已更新',next==='needs_retry'?'这里只做人工标记，不会自动重新生成，也不会产生费用。':REVIEW_LABELS[next]);}"
r54 = replace_once(r54, old_set, new_set, 'r54 setReview')
r54 = replace_once(r54, "if(event.target.closest('.project-child,[data-select-parent]'))setTimeout(()=>{state.selectedDeliverableId='';renderContext();renderSummary();queueEnhance();},30);", "if(event.target.closest('[data-select-parent]'))setTimeout(()=>{state.selectedDeliverableId='';renderContext();renderSummary();},30);", 'r54 task click')
r54 = replace_once(r54, "try{await loadData();enhanceTree();renderContext();startObserver();state.syncTimer=setInterval(()=>{void syncDraftLinks();},6000);document.body.dataset.davisVideoDeliverablesR54='ready';console.log('[Davis Video Deliverables]',BUILD);}", "try{await loadData();enhanceTree();renderContext();startObserver();document.addEventListener('davis-video-task-selected',()=>{state.selectedDeliverableId='';renderContext();renderSummary();});document.body.dataset.davisVideoDeliverablesR54='ready';console.log('[Davis Video Deliverables]',BUILD);}", 'r54 init timer')
r54_path.write_text(r54)

app = app_path.read_text()
pattern = re.compile(r"async function r49SelectDraft\(id\) \{[\s\S]*?\n\}\nasync function r49RemoveTask\(\) \{")
if len(list(pattern.finditer(app))) != 1:
    raise SystemExit('app r49SelectDraft expected exactly 1 match')
replacement = '''function r50ApplySelectedTaskDom(draftId, groupId) {
  const root = $('project-list');
  if (!root) return;
  root.querySelectorAll('.project-child.active').forEach(node => node.classList.remove('active'));
  const task = root.querySelector(`.project-child[data-project="${CSS.escape(String(draftId || ''))}"]`);
  task?.classList.add('active');
  root.querySelectorAll('.project-parent-row').forEach(row => {
    const parentId = String(row.querySelector('[data-select-parent]')?.dataset?.selectParent || '');
    row.classList.toggle('is-active', Boolean(groupId) && parentId === String(groupId));
    row.classList.remove('is-project-selected');
  });
}

async function r49SelectDraft(id) {
  const draft = migrateDraftWorkspaces(await getDraft(id)); if (!draft) return;
  clearInterval(state.pollTimer); state.pollTimer = null; state.objectUrls.forEach(url => URL.revokeObjectURL(url)); state.objectUrls.clear();
  state.draft = draft; bindCurrentWorkspace(); normalizeSegments(state.draft); saveCurrentWorkspaceSelection();
  const groupId = r49ParentGroupIdForDraft(draft);
  r50SetTreeSelection('task', groupId, draft.id);
  localStorage.setItem(LAST_SELECTED_DRAFT_KEY,id);
  r50ApplySelectedTaskDom(draft.id, groupId);
  renderAll(); r49RenderTaskContext();
  document.dispatchEvent(new CustomEvent('davis-video-task-selected',{detail:{draftId:String(draft.id),groupId:String(groupId||'')}}));
  const workspace = getWorkspace();
  try { if (!Number(workspace.cloudSyncedAt || 0) || Date.now() - Number(workspace.cloudSyncedAt || 0) > 5 * 60_000) await loadOutputs(false); } catch (error) { console.warn('[Davis Video Studio R50] task sync failed', error); }
  renderAll(); r49RenderTaskContext(); r16ApplyReadOnlyControls(); r50SyncDeleteButton();
  const active = state.draft.segments.some(s => ['submitting','submitted','queued','running','processing'].includes(String(s.status || '').toLowerCase()));
  if (active && r16CurrentProjectWritable()) startPolling();
}
async function r49RemoveTask() {'''
app = pattern.sub(replacement, app, count=1)
app_path.write_text(app)

aui_path = Path('seedance/a-ui-category-tools.js')
aui_path.write_text('''const $ = (s, root = document) => root.querySelector(s);\nconst $$ = (s, root = document) => [...root.querySelectorAll(s)];\nconst BUSINESS_STATUS = Object.freeze({ accepted:'定版', backup:'备用', rejected:'废弃' });\nfunction currentReviewSelect(){return $('[data-r54-review-select]');}\nfunction currentReviewHost(){const select=currentReviewSelect();return select?.closest('.r54-review-control')?.parentElement||$('#r54-context-extra');}\nfunction syncReviewButtons(status=currentReviewSelect()?.value||''){const group=$('.a-review-buttons');if(!group)return;$$('[data-a-review]',group).forEach(button=>button.classList.toggle('active',button.dataset.aReview===status));}\nfunction syncSidebarPill(localId,status){if(!localId)return;const task=$(`.project-child[data-project="${CSS.escape(String(localId))}"]`);const row=task?.closest('.r54-task-row');const pill=row?.querySelector(':scope > .r54-pill');if(!pill)return;pill.dataset.status=status;pill.textContent=BUSINESS_STATUS[status]||'';}\nfunction ensureReviewButtons(){const select=currentReviewSelect(),host=currentReviewHost();if(!select||!host)return false;const control=select.closest('.r54-review-control');if(control)control.hidden=true;let group=$('.a-review-buttons',host);if(!group){group=document.createElement('div');group.className='a-review-buttons';group.setAttribute('role','group');group.setAttribute('aria-label','状态');group.innerHTML='<button type="button" data-a-review="accepted">定版</button><button type="button" data-a-review="backup">备用</button><button type="button" data-a-review="rejected">废弃</button>';host.appendChild(group);}group.dataset.localId=select.dataset.localId||'';syncReviewButtons(select.value);return true;}\nfunction handleReviewClick(event){const button=event.target.closest?.('[data-a-review]');if(!button)return;const select=currentReviewSelect();if(!select||select.disabled)return;const next=button.dataset.aReview;if(!BUSINESS_STATUS[next])return;const localId=select.dataset.localId||$('.project-child.active')?.dataset?.project||'';select.value=next;syncReviewButtons(next);syncSidebarPill(localId,next);select.dispatchEvent(new Event('change',{bubbles:true}));}\nfunction scheduleReviewMount(){requestAnimationFrame(()=>ensureReviewButtons());setTimeout(()=>ensureReviewButtons(),40);}\nfunction installReviewUi(){const context=$('#child-task-context');if(!context)return;context.addEventListener('click',handleReviewClick);const observer=new MutationObserver(()=>ensureReviewButtons());observer.observe(context,{childList:true,subtree:true});document.addEventListener('davis-video-review-status-changed',event=>{const localId=event.detail?.localId||currentReviewSelect()?.dataset?.localId||'';const status=event.detail?.status||currentReviewSelect()?.value||'';syncReviewButtons(status);syncSidebarPill(localId,status);});document.addEventListener('davis-video-task-selected',()=>scheduleReviewMount());scheduleReviewMount();}\nfunction start(){installReviewUi();}\nif(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();\n''')

html_path = Path('ai-assistant.html')
html = html_path.read_text()
html = re.sub(r'a-ui-layout-fix\.css\?v=[^"\']+', 'a-ui-layout-fix.css?v=20260812-r12-task-state-1', html)
html = re.sub(r'app\.js\?v=[^"\']+', 'app.js?v=20260812-r12-task-state-1', html)
html = re.sub(r'a-ui-category-tools\.js\?v=[^"\']+', 'a-ui-category-tools.js?v=20260812-r12-task-state-1', html)
html = re.sub(r'supabase-config\.js\?v=[^"\']+', 'supabase-config.js?v=20260812-r12-task-state-1', html)
html_path.write_text(html)

config_path = Path('supabase-config.js')
config = config_path.read_text()
config = re.sub(r"r54-deliverables\.js\?v=[^'\"]+", "r54-deliverables.js?v=20260812-r12-task-state-1", config)
config_path.write_text(config)
print('R12 patch applied')

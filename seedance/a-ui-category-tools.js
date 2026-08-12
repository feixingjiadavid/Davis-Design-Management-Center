const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const BUSINESS_STATUS = Object.freeze({ accepted:'定版', backup:'备用', rejected:'废弃' });

function businessStatus(value){
  const raw=String(value||'').trim();
  if(raw==='accepted')return 'accepted';
  if(raw==='rejected')return 'rejected';
  return 'backup';
}
function currentReviewSelect(){return $('[data-r54-review-select]');}
function currentReviewHost(){return $('#r54-context-extra')||currentReviewSelect()?.closest('.r54-review-control')?.parentElement||null;}
function currentReviewGroup(){return $('.a-review-buttons');}
function syncReviewButtons(status){
  const normalized=businessStatus(status),group=currentReviewGroup();
  if(!group)return;
  group.dataset.status=normalized;
  $$('[data-a-review]',group).forEach(button=>button.classList.toggle('active',button.dataset.aReview===normalized));
}
function syncSidebarPill(localId,status){
  if(!localId)return;
  const task=$(`.project-child[data-project="${CSS.escape(String(localId))}"]`),row=task?.closest('.r54-task-row'),pill=row?.querySelector(':scope > .r54-pill');
  if(!pill)return;
  const normalized=businessStatus(status);
  if(pill.dataset.status!==normalized)pill.dataset.status=normalized;
  if(pill.textContent!==BUSINESS_STATUS[normalized])pill.textContent=BUSINESS_STATUS[normalized];
}
function normalizeSidebarPills(root=document){
  $$('.r54-task-row > .r54-pill',root).forEach(pill=>{
    const normalized=businessStatus(pill.dataset.status);
    if(pill.dataset.status!==normalized)pill.dataset.status=normalized;
    if(pill.textContent!==BUSINESS_STATUS[normalized])pill.textContent=BUSINESS_STATUS[normalized];
  });
}
function statusFromSidebar(localId){
  if(!localId)return 'backup';
  const task=$(`.project-child[data-project="${CSS.escape(String(localId))}"]`),pill=task?.closest('.r54-task-row')?.querySelector(':scope > .r54-pill');
  return businessStatus(pill?.dataset?.status||'backup');
}
function ensureReviewButtons(){
  const host=currentReviewHost();
  if(!host)return false;
  const select=currentReviewSelect(),control=select?.closest('.r54-review-control');
  if(control)control.hidden=true;
  let group=$('.a-review-buttons',host);
  if(!group){
    group=document.createElement('div');
    group.className='a-review-buttons';
    group.setAttribute('role','group');
    group.setAttribute('aria-label','状态');
    group.innerHTML='<button type="button" data-a-review="accepted">定版</button><button type="button" data-a-review="backup">备用</button><button type="button" data-a-review="rejected">废弃</button>';
    host.appendChild(group);
  }
  if(!group.dataset.localId && select?.dataset?.localId)group.dataset.localId=String(select.dataset.localId);
  normalizeSidebarPills();
  return true;
}
function bindSelectedTask(localId){
  const id=String(localId||'');
  if(!id)return;
  ensureReviewButtons();
  const group=currentReviewGroup();
  if(!group)return;
  group.dataset.localId=id;
  group.classList.remove('is-saving');
  syncReviewButtons(statusFromSidebar(id));
}
function handleReviewClick(event){
  const button=event.target.closest?.('[data-a-review]');
  if(!button)return;
  const group=button.closest('.a-review-buttons');
  const localId=String(group?.dataset?.localId||'');
  const next=String(button.dataset.aReview||'');
  if(!localId||!BUSINESS_STATUS[next])return;
  syncReviewButtons(next);
  syncSidebarPill(localId,next);
  group.classList.add('is-saving');
  document.dispatchEvent(new CustomEvent('davis-video-review-status-requested',{detail:{localId,status:next}}));
}
function scheduleReviewMount(localId=''){
  requestAnimationFrame(()=>{ensureReviewButtons();normalizeSidebarPills();if(localId)bindSelectedTask(localId);});
  setTimeout(()=>{ensureReviewButtons();normalizeSidebarPills();if(localId)bindSelectedTask(localId);},40);
}
function installReviewUi(){
  const context=$('#child-task-context');
  if(!context)return;
  context.addEventListener('click',handleReviewClick);
  const contextObserver=new MutationObserver(()=>ensureReviewButtons());
  contextObserver.observe(context,{childList:true,subtree:true});
  const projectList=$('#project-list');
  if(projectList){
    let sidebarFrame=0;
    const sidebarObserver=new MutationObserver(()=>{
      cancelAnimationFrame(sidebarFrame);
      sidebarFrame=requestAnimationFrame(()=>normalizeSidebarPills(projectList));
    });
    sidebarObserver.observe(projectList,{childList:true,subtree:true});
  }
  document.addEventListener('davis-video-review-status-changed',event=>{
    const localId=String(event.detail?.localId||'');
    const status=businessStatus(event.detail?.status||'');
    syncSidebarPill(localId,status);
    const group=currentReviewGroup();
    if(group && String(group.dataset.localId||'')===localId){
      group.classList.remove('is-saving');
      syncReviewButtons(status);
    }
  });
  document.addEventListener('davis-video-review-status-failed',event=>{
    const localId=String(event.detail?.localId||''),group=currentReviewGroup();
    if(group && String(group.dataset.localId||'')===localId){
      group.classList.remove('is-saving');
      syncReviewButtons(statusFromSidebar(localId));
    }
  });
  document.addEventListener('davis-video-review-context-changed',event=>{
    const localId=String(event.detail?.localId||'');
    if(!localId)return;
    const status=businessStatus(event.detail?.status||'');
    ensureReviewButtons();
    const group=currentReviewGroup();
    if(!group)return;
    group.dataset.localId=localId;
    group.classList.remove('is-saving');
    syncReviewButtons(status);
    syncSidebarPill(localId,status);
  });
  document.addEventListener('davis-video-task-selected',event=>{
    const localId=String(event.detail?.draftId||'');
    bindSelectedTask(localId);
    scheduleReviewMount(localId);
  });
  scheduleReviewMount();
}
function start(){installReviewUi();normalizeSidebarPills();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

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
function currentReviewHost(){const select=currentReviewSelect();return select?.closest('.r54-review-control')?.parentElement||$('#r54-context-extra');}
function syncReviewButtons(status=currentReviewSelect()?.value||''){
  const normalized=businessStatus(status),group=$('.a-review-buttons');
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
function ensureReviewButtons(){
  const select=currentReviewSelect(),host=currentReviewHost();
  if(!select||!host)return false;
  const control=select.closest('.r54-review-control');
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
  group.dataset.localId=select.dataset.localId||'';
  syncReviewButtons(select.value);
  normalizeSidebarPills();
  return true;
}
function handleReviewClick(event){
  const button=event.target.closest?.('[data-a-review]');
  if(!button)return;
  const select=currentReviewSelect();
  if(!select||select.disabled)return;
  const next=button.dataset.aReview;
  if(!BUSINESS_STATUS[next])return;
  const localId=button.closest('.a-review-buttons')?.dataset?.localId||select.dataset.localId||$('.project-child.active')?.dataset?.project||'';
  select.value=next;
  syncReviewButtons(next);
  syncSidebarPill(localId,next);
  select.dispatchEvent(new Event('change',{bubbles:true}));
}
function scheduleReviewMount(){requestAnimationFrame(()=>{ensureReviewButtons();normalizeSidebarPills();});setTimeout(()=>{ensureReviewButtons();normalizeSidebarPills();},40);}
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
    const localId=event.detail?.localId||currentReviewSelect()?.dataset?.localId||'';
    const status=businessStatus(event.detail?.status||currentReviewSelect()?.value||'');
    syncReviewButtons(status);
    syncSidebarPill(localId,status);
  });
  document.addEventListener('davis-video-review-context-changed',event=>{
    const localId=String(event.detail?.localId||''),status=businessStatus(event.detail?.status||'');
    ensureReviewButtons();
    const group=$('.a-review-buttons');
    if(group)group.dataset.localId=localId;
    syncReviewButtons(status);
    syncSidebarPill(localId,status);
  });
  document.addEventListener('davis-video-task-selected',()=>scheduleReviewMount());
  scheduleReviewMount();
}
function start(){installReviewUi();normalizeSidebarPills();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

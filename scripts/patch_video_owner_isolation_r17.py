from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)

# --- app.js: isolate browser drafts and make no-task state explicit ---
app_path = Path('seedance/app.js')
app = app_path.read_text(encoding='utf-8')

app = replace_once(
    app,
    "./access-control.mjs?v=20260729-user-isolation-r16",
    "./access-control.mjs?v=20260813-owner-isolation-r17",
    'access-control cache version',
)

app = replace_once(
    app,
    "  draft.ownerId = draft.remoteOwnerId || draft.ownerId || state.user?.id || null;\n  workspace.ownerId = draft.ownerId;",
    "  draft.ownerId = draft.remoteOwnerId || draft.ownerId || workspace.ownerId || null;\n  workspace.ownerId = draft.ownerId || workspace.ownerId || null;",
    'do not adopt ownerless legacy local draft',
)

owner_fn = """function r16ProjectOwnerId(draft = state.draft) {
  if (!draft) return '';
  const mode = r5ModeKey(draft.lockedMode || draft.mode);
  const workspace = draft.workspaces?.[mode] || draft;
  return String(workspace.remoteOwnerId || draft.remoteOwnerId || draft.ownerId || '').trim();
}
"""
owner_helpers = owner_fn + """
function r17LocalDraftOwnerId(draft) {
  if (!draft) return '';
  const direct = String(draft.remoteOwnerId || draft.ownerId || '').trim();
  if (direct) return direct;
  for (const workspace of Object.values(draft.workspaces || {})) {
    const ownerId = String(workspace?.remoteOwnerId || workspace?.ownerId || '').trim();
    if (ownerId) return ownerId;
  }
  return '';
}

function r17LocalDraftsForCurrentUser(drafts) {
  const userId = String(state.user?.id || '').trim();
  if (!userId) return [];
  return (drafts || []).filter(draft => r17LocalDraftOwnerId(draft) === userId);
}
"""
app = replace_once(app, owner_fn, owner_helpers, 'local draft owner helpers')

app = replace_once(
    app,
    ".select('id,owner_id,name,project_category,status,created_at,updated_at,metadata')\n    .neq('status','deleted').order('updated_at',{ascending:false}).limit(1000);",
    ".select('id,owner_id,name,project_category,status,created_at,updated_at,metadata')\n    .eq('owner_id',state.user.id).neq('status','deleted').order('updated_at',{ascending:false}).limit(1000);",
    'parent groups owner scope',
)

app = replace_once(
    app,
    "  const drafts = cleanLocal.filter(draft => { const ownerId = r16ProjectOwnerId(draft); return isVideoSuperAdmin(state.user) || !ownerId || ownerId === state.user.id; });",
    "  const drafts = cleanLocal.filter(draft => r16ProjectOwnerId(draft) === state.user.id);",
    'restored local draft owner filter',
)

app = replace_once(
    app,
    "  state.drafts = await r49RestoreCloudDrafts(await r5MigrateDraftCollection(await listDrafts()));",
    "  state.drafts = await r49RestoreCloudDrafts(await r5MigrateDraftCollection(r17LocalDraftsForCurrentUser(await listDrafts())));",
    'scope local drafts before migration',
)

assert_old = """function r16AssertCurrentProjectWritable(actionLabel = '修改这个项目') {
  if (r16CurrentProjectWritable()) return true;
  toast('只读项目', `这是其他用户的项目，不能${actionLabel}。`);
  return false;
}
"""
assert_new = """function r16AssertCurrentProjectWritable(actionLabel = '修改这个项目') {
  if (!state.draft) {
    toast('请先创建生成任务', '成片单元只是交付分组。请先点击“＋任务”创建一个生成任务，再上传素材或生成视频。');
    return false;
  }
  if (r16CurrentProjectWritable()) return true;
  toast('只读项目', `当前任务不属于这个账号，不能${actionLabel}。`);
  return false;
}
"""
app = replace_once(app, assert_old, assert_new, 'no-task versus foreign-task message')

app = replace_once(
    app,
    "r16ProjectOwnerId,r16ScopeProjectRead,r16CurrentProjectWritable,r16AssertCurrentProjectWritable,r16ApplyReadOnlyControls,",
    "r16ProjectOwnerId,r17LocalDraftOwnerId,r17LocalDraftsForCurrentUser,r16ScopeProjectRead,r16CurrentProjectWritable,r16AssertCurrentProjectWritable,r16ApplyReadOnlyControls,",
    'inject local draft owner helpers into runtime',
)

app_path.write_text(app, encoding='utf-8')

# --- R54: owner-scope all UI data and continue deliverable creation into a real task ---
r54_path = Path('seedance/r54-deliverables.js')
r54 = r54_path.read_text(encoding='utf-8')

r54 = replace_once(
    r54,
    "function isOwner(group) { return Boolean(group && state.user && String(group.owner_id)===String(state.user.id)); }",
    "function isOwner(group) { return Boolean(group && state.user && String(group.owner_id)===String(state.user.id)); }\nfunction localDraftOwnerId(draft) { const w=workspaceOf(draft); return text(w?.remoteOwnerId || draft?.remoteOwnerId || draft?.ownerId || w?.ownerId); }\nfunction localDraftsForCurrentUser(drafts) { const uid=text(state.user?.id); return uid ? (drafts||[]).filter(d=>localDraftOwnerId(d)===uid && !d?.deleted) : []; }",
    'R54 local draft owner scope helpers',
)

r54 = replace_once(
    r54,
    "    supabase.from('video_project_groups').select('id,owner_id,name,project_category,status,created_at,updated_at,metadata').neq('status','deleted').limit(1000),\n    supabase.from('video_deliverables').select('*').neq('status','deleted').order('sort_order',{ascending:true}).limit(2000),\n    supabase.from('video_projects').select('id,owner_id,name,parent_group_id,task_name,task_order,status,deliverable_id,subject_key,attempt_no,retry_of_project_id,review_status,created_at,updated_at').neq('status','deleted').limit(3000),\n    listDrafts(),",
    "    supabase.from('video_project_groups').select('id,owner_id,name,project_category,status,created_at,updated_at,metadata').eq('owner_id',state.user.id).neq('status','deleted').limit(1000),\n    supabase.from('video_deliverables').select('*').eq('owner_id',state.user.id).neq('status','deleted').order('sort_order',{ascending:true}).limit(2000),\n    supabase.from('video_projects').select('id,owner_id,name,parent_group_id,task_name,task_order,status,deliverable_id,subject_key,attempt_no,retry_of_project_id,review_status,created_at,updated_at').eq('owner_id',state.user.id).neq('status','deleted').limit(3000),\n    listDrafts(),",
    'R54 cloud owner scopes',
)

r54 = replace_once(
    r54,
    "  state.groups=groups.data||[]; state.deliverables=deliverables.data||[]; state.projects=projects.data||[]; state.drafts=(drafts||[]).filter(x=>!x?.deleted);",
    "  state.groups=groups.data||[]; state.deliverables=deliverables.data||[]; state.projects=projects.data||[]; state.drafts=localDraftsForCurrentUser(drafts);",
    'R54 local draft owner filter',
)

old_create = "state.deliverables.push(result.data);refreshMaps();document.querySelectorAll('.project-child-list').forEach(x=>delete x.dataset.r54);queueEnhance();toast('成片单元已创建',`“${name}”已加入项目。`);"
new_create = "state.deliverables.push(result.data);refreshMaps();document.querySelectorAll('.project-child-list').forEach(x=>delete x.dataset.r54);queueEnhance();toast('成片单元已创建',`“${name}”已加入项目。接下来创建具体生成任务。`);void openChildTaskForDeliverable(gid,result.data.id);"
r54 = replace_once(r54, old_create, new_create, 'continue deliverable into child task creation')

r54_path.write_text(r54, encoding='utf-8')

# --- Sidebar: show only the useful +task action on deliverable headers ---
css_path = Path('seedance/a-ui-layout-fix.css')
css = css_path.read_text(encoding='utf-8')
css = replace_once(
    css,
    ".project-child-list .r54-deliverable-actions{display:none!important}",
    ".project-child-list .r54-deliverable-actions{display:flex!important;align-items:center!important;flex:0 0 auto!important}\n.project-child-list .r54-deliverable-actions button{display:none!important}\n.project-child-list .r54-deliverable-actions button[data-r54-add-task]{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:26px!important;padding:0 8px!important;border-radius:7px!important;font-size:10px!important;white-space:nowrap!important}",
    'visible deliverable add-task action',
)
css_path.write_text(css, encoding='utf-8')

# --- Cache bust changed assets only ---
html_path = Path('ai-assistant.html')
html = html_path.read_text(encoding='utf-8')
html = re.sub(r'a-ui-layout-fix\.css\?v=[^\"\']+', 'a-ui-layout-fix.css?v=20260813-owner-isolation-r17', html)
html = re.sub(r'app\.js\?v=[^\"\']+', 'app.js?v=20260813-owner-isolation-r17', html)
html_path.write_text(html, encoding='utf-8')

config_path = Path('supabase-config.js')
config = config_path.read_text(encoding='utf-8')
config = re.sub(r"r54-deliverables\.js\?v=[^'\"]+", "r54-deliverables.js?v=20260813-owner-isolation-r17", config)
config_path.write_text(config, encoding='utf-8')

print('owner isolation R17 patch applied')

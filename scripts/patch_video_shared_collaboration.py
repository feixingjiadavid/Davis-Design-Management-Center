from pathlib import Path
import re

# One-time R17 patch: shared authenticated collaboration with owner-only delete.

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)

app_path = Path('seedance/app.js')
app = app_path.read_text()

app = app.replace("./access-control.mjs?v=20260729-user-isolation-r16", "./access-control.mjs?v=20260813-shared-collaboration-r17")

app = replace_once(
    app,
    "function r16ScopeProjectRead(query, draft = state.draft) {\n  const ownerId = r16ProjectOwnerId(draft);\n  return ownerId ? query.eq('owner_id', ownerId) : scopeVideoRead(query, state.user);\n}",
    "function r16ScopeProjectRead(query, draft = state.draft) {\n  return scopeVideoRead(query, state.user);\n}",
    'shared project read scope',
)

old = """function r16CurrentProjectWritable(draft = state.draft) {
  return canMutateVideoOwner(state.user, r16ProjectOwnerId(draft));
}

function r16AssertCurrentProjectWritable(actionLabel = '修改这个项目') {
  if (r16CurrentProjectWritable()) return true;
  toast('只读项目', `这是其他用户的项目，不能${actionLabel}。`);
  return false;
}
"""
new = """function r16CurrentProjectWritable(draft = state.draft) {
  return canMutateVideoOwner(state.user, r16ProjectOwnerId(draft));
}

function r16CurrentProjectDeletable(draft = state.draft) {
  return canDeleteVideoOwner(state.user, r16ProjectOwnerId(draft));
}

function r16AssertCurrentProjectWritable(actionLabel = '修改这个项目') {
  if (r16CurrentProjectWritable()) return true;
  toast('无法操作', `当前账号不能${actionLabel}。`);
  return false;
}

function r16AssertCurrentProjectDeletable(actionLabel = '删除这个项目') {
  if (r16CurrentProjectDeletable()) return true;
  toast('仅原创建人可删除', `你可以继续协作编辑和生成，但不能${actionLabel}。`);
  return false;
}
"""
app = replace_once(app, old, new, 'separate collaborative edit from owner delete')

app = app.replace("if (!r16AssertCurrentProjectWritable('删除生成任务')) return;", "if (!r16AssertCurrentProjectDeletable('删除生成任务')) return;")
app = app.replace("if (!r16AssertCurrentProjectWritable('删除项目')) return;", "if (!r16AssertCurrentProjectDeletable('删除项目')) return;")

app = replace_once(
    app,
    "  if (String(group.owner_id || '') !== String(state.user?.id || '')) return toast('只读项目','不能在其他用户的项目下新增任务。');\n",
    "",
    'allow child tasks in shared groups',
)
app = app.replace(".eq('id',group.id).eq('owner_id',state.user.id)", ".eq('id',group.id)")

app = app.replace(
    "const drafts = cleanLocal.filter(draft => { const ownerId = r16ProjectOwnerId(draft); return isVideoSuperAdmin(state.user) || !ownerId || ownerId === state.user.id; });",
    "const drafts = cleanLocal.filter(Boolean);",
)
app = re.sub(
    r"const drafts = cleanLocal\.filter\(draft => \{\s*const ownerId = r16ProjectOwnerId\(draft\);\s*return isVideoSuperAdmin\(state\.user\) \|\| ownerId === state\.user\.id;\s*\}\);",
    "const drafts = cleanLocal.filter(Boolean);",
    app,
)

app = replace_once(
    app,
    "  const writable = Boolean(draft) && r16CurrentProjectWritable(draft);\n  button.disabled = !writable;\n  button.title = draft && !writable ? '其他用户的任务仅允许查看' : '删除当前子生成任务';",
    "  const deletable = Boolean(draft) && r16CurrentProjectDeletable(draft);\n  button.disabled = !deletable;\n  button.title = draft && !deletable ? '可协作编辑；仅原创建人可删除该任务' : '删除当前子生成任务';",
    'owner-only child delete button',
)

app_path.write_text(app)

r54_path = Path('seedance/r54-deliverables.js')
r54 = r54_path.read_text()
r54 = replace_once(
    r54,
    "function isOwner(group) { return Boolean(group && state.user && String(group.owner_id)===String(state.user.id)); }",
    "function isOwner(group) { return Boolean(group && state.user && String(group.owner_id)===String(state.user.id)); }\nfunction canCollaborate(group) { return Boolean(group && state.user?.id); }",
    'R54 collaborator helper',
)
r54 = r54.replace("if(isOwner(group)){const tools=", "if(canCollaborate(group)){const tools=")
r54 = r54.replace("async function createDeliverable(gid){const group=state.groupById.get(String(gid));if(!isOwner(group))return toast('只读项目','不能修改其他用户的项目。');", "async function createDeliverable(gid){const group=state.groupById.get(String(gid));if(!canCollaborate(group))return;")
r54 = r54.replace("async function openChildTaskForDeliverable(gid,did){const group=state.groupById.get(String(gid));if(!isOwner(group))return;", "async function openChildTaskForDeliverable(gid,did){const group=state.groupById.get(String(gid));if(!canCollaborate(group))return;")
r54 = r54.replace("function openBatch(gid,did){const group=state.groupById.get(String(gid)),d=state.deliverableById.get(String(did));if(!isOwner(group)||!d)return;", "function openBatch(gid,did){const group=state.groupById.get(String(gid)),d=state.deliverableById.get(String(did));if(!canCollaborate(group)||!d)return;")
r54 = r54.replace("async function batchGenerate(gid,did){if(state.executingBatch)return;const group=state.groupById.get(String(gid));if(!isOwner(group))return;", "async function batchGenerate(gid,did){if(state.executingBatch)return;const group=state.groupById.get(String(gid));if(!canCollaborate(group))return;")

old_actions = "${isOwner(group)?`<div class=\"r54-deliverable-actions\"><button data-r54-add-task=\"${esc(did)}\" data-group-id=\"${esc(group.id)}\">＋任务</button><button data-r54-batch-import=\"${esc(did)}\" data-group-id=\"${esc(group.id)}\">批量导入</button><button data-r54-batch-generate=\"${esc(did)}\" data-group-id=\"${esc(group.id)}\">批量生成</button><button data-r54-delete-deliverable=\"${esc(did)}\">删除</button></div>`:''}"
new_actions = "${canCollaborate(group)?`<div class=\"r54-deliverable-actions\"><button data-r54-add-task=\"${esc(did)}\" data-group-id=\"${esc(group.id)}\">＋任务</button><button data-r54-batch-import=\"${esc(did)}\" data-group-id=\"${esc(group.id)}\">批量导入</button><button data-r54-batch-generate=\"${esc(did)}\" data-group-id=\"${esc(group.id)}\">批量生成</button>${isOwner(group)?`<button data-r54-delete-deliverable=\"${esc(did)}\">删除</button>`:''}</div>`:''}"
r54 = replace_once(r54, old_actions, new_actions, 'R54 collaborative actions with owner-only delete')

r54 = r54.replace(".eq('id',rid).eq('owner_id',state.user.id)", ".eq('id',rid)")
r54_path.write_text(r54)

# Cache-bust actual changed runtime assets.
html_path = Path('ai-assistant.html')
html = html_path.read_text()
html = re.sub(r'app\.js\?v=[^\"\']+', 'app.js?v=20260813-shared-collaboration-1', html)
html_path.write_text(html)

config_path = Path('supabase-config.js')
config = config_path.read_text()
config = re.sub(r"r54-deliverables\.js\?v=[^'\"]+", "r54-deliverables.js?v=20260813-shared-collaboration-1", config)
config_path.write_text(config)

print('shared collaboration runtime patch applied')

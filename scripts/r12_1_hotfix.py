from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)

# 1) Production patched runtime must include helper called by r49SelectDraft.
app_path = Path('seedance/app.js')
app = app_path.read_text()
if 'r50ApplySelectedTaskDom,r49SelectDraft' not in app:
    app = replace_once(
        app,
        'r49WireHierarchyUi,r49RenderSettings,r49SelectDraft,',
        'r49WireHierarchyUi,r49RenderSettings,r50ApplySelectedTaskDom,r49SelectDraft,',
        'inject r50ApplySelectedTaskDom'
    )
app_path.write_text(app)

# 2) R54 publishes the selected local task + its resolved business status explicitly.
r54_path = Path('seedance/r54-deliverables.js')
r54 = r54_path.read_text()
old_tail = "  const select=$('[data-r54-review-select]',extra);\n  if(select && document.activeElement!==select) select.value=normalized;\n}"
new_tail = "  const select=$('[data-r54-review-select]',extra);\n  if(select && document.activeElement!==select) select.value=normalized;\n  document.dispatchEvent(new CustomEvent('davis-video-review-context-changed',{detail:{localId,status:normalized}}));\n}"
if 'davis-video-review-context-changed' not in r54:
    r54 = replace_once(r54, old_tail, new_tail, 'publish review context')
r54_path.write_text(r54)

# 3) Top-right buttons subscribe to that explicit context; no guessed/global status.
aui_path = Path('seedance/a-ui-category-tools.js')
aui = aui_path.read_text()
if 'davis-video-review-context-changed' not in aui:
    marker = "document.addEventListener('davis-video-review-status-changed',event=>{const localId=event.detail?.localId||currentReviewSelect()?.dataset?.localId||'';const status=event.detail?.status||currentReviewSelect()?.value||'';syncReviewButtons(status);syncSidebarPill(localId,status);});"
    addition = marker + "document.addEventListener('davis-video-review-context-changed',event=>{const localId=String(event.detail?.localId||'');const status=String(event.detail?.status||'');ensureReviewButtons();const group=$('.a-review-buttons');if(group)group.dataset.localId=localId;syncReviewButtons(status);});"
    aui = replace_once(aui, marker, addition, 'subscribe review context')
# Button clicks must target the exact current context id.
aui = aui.replace("const localId=select.dataset.localId||$('.project-child.active')?.dataset?.project||'';", "const localId=button.closest('.a-review-buttons')?.dataset?.localId||select.dataset.localId||$('.project-child.active')?.dataset?.project||'';")
aui_path.write_text(aui)

# 4) Cache bust changed runtime assets.
html_path = Path('ai-assistant.html')
html = html_path.read_text()
html = re.sub(r'app\.js\?v=[^\"\']+', 'app.js?v=20260812-r12-1-task-switch-1', html)
html = re.sub(r'a-ui-category-tools\.js\?v=[^\"\']+', 'a-ui-category-tools.js?v=20260812-r12-1-task-switch-1', html)
html = re.sub(r'supabase-config\.js\?v=[^\"\']+', 'supabase-config.js?v=20260812-r12-1-task-switch-1', html)
html_path.write_text(html)

config_path = Path('supabase-config.js')
config = config_path.read_text()
config = re.sub(r"r54-deliverables\.js\?v=[^'\"]+", "r54-deliverables.js?v=20260812-r12-1-task-switch-1", config)
config_path.write_text(config)

print('R12.1 hotfix applied')

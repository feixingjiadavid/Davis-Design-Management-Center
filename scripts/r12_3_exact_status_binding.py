from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)

r54_path = Path('seedance/r54-deliverables.js')
r54 = r54_path.read_text()

r54 = replace_once(
    r54,
    "function renderContext(){\n  const host=$('child-task-context'); if(!host)return;",
    "function renderContext(localIdOverride=''){\n  const host=$('child-task-context'); if(!host)return;",
    'renderContext signature'
)
r54 = replace_once(
    r54,
    "  const draft=currentDraft();\n  if(!draft){extra.innerHTML='';extra.dataset.localId='';return;}",
    "  const draft=localIdOverride ? state.draftById.get(String(localIdOverride)) || null : currentDraft();\n  if(!draft){extra.innerHTML='';extra.dataset.localId='';return;}",
    'renderContext exact draft'
)

request_listener = "document.addEventListener('davis-video-review-status-requested',event=>{const localId=String(event.detail?.localId||''),status=normalizeReviewStatus(event.detail?.status);if(!localId||!['accepted','backup','rejected'].includes(status))return;void setReview(localId,status).then(()=>{document.dispatchEvent(new CustomEvent('davis-video-review-status-changed',{detail:{localId,status}}));renderContext(localId);}).catch(error=>{document.dispatchEvent(new CustomEvent('davis-video-review-status-failed',{detail:{localId,status,error:errorMessage(error)}}));renderContext(localId);toast('状态更新失败',errorMessage(error));});});"
if 'davis-video-review-status-requested' not in r54:
    r54 = replace_once(
        r54,
        "$('r54-sheet')?.addEventListener('change',async event=>{",
        request_listener + "$('r54-sheet')?.addEventListener('change',async event=>{",
        'exact review request listener'
    )

r54 = replace_once(
    r54,
    "document.addEventListener('davis-video-task-selected',()=>{state.selectedDeliverableId='';renderContext();renderSummary();});",
    "document.addEventListener('davis-video-task-selected',event=>{state.selectedDeliverableId='';renderContext(event.detail?.draftId||'');renderSummary();});",
    'exact selected task context'
)
r54_path.write_text(r54)

# Cache bust the two changed UI runtime assets.
html_path = Path('ai-assistant.html')
html = html_path.read_text()
html = re.sub(r'a-ui-category-tools\.js\?v=[^\"\']+', 'a-ui-category-tools.js?v=20260812-r12-3-exact-status-1', html)
html_path.write_text(html)

config_path = Path('supabase-config.js')
config = config_path.read_text()
config = re.sub(r"r54-deliverables\.js\?v=[^'\"]+", "r54-deliverables.js?v=20260812-r12-3-exact-status-1", config)
config_path.write_text(config)

# Keep this regression permanently in normal PR CI.
check_path = Path('.github/workflows/r54-check.yml')
check = check_path.read_text()
old = 'node --test seedance/r12-2-status-regression.test.mjs seedance/r12-1-regression.test.mjs seedance/r54-deliverables-core.test.mjs seedance/r54-import-normalization.test.mjs seedance/a-version-regression.test.mjs seedance/a-ui-mount.test.mjs'
new = 'node --test seedance/r12-3-status-binding-regression.test.mjs seedance/r12-2-status-regression.test.mjs seedance/r12-1-regression.test.mjs seedance/r54-deliverables-core.test.mjs seedance/r54-import-normalization.test.mjs seedance/a-version-regression.test.mjs seedance/a-ui-mount.test.mjs'
if old in check:
    check = check.replace(old, new, 1)
elif 'r12-3-status-binding-regression.test.mjs' not in check:
    raise SystemExit('cannot locate A-version test command')
check_path.write_text(check)

print('R12.3 exact status binding patch applied')

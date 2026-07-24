import { supabase } from '../supabase-config.js';
import {
  buildOptimizationPayload,
  missingReferenceTokens,
} from './prompt-optimizer-core.js';

const BUILD = '20260724-davis-video-optimizer-v4';
const FUNCTION_NAME = 'seedance-prompt-optimize';
const VISION_FUNCTION_NAME = 'seedance-vision-analyze';
const MAX_VISION_IMAGES = 3;
const VISION_TIMEOUT_MS = 15000;
const OPTIMIZE_TIMEOUT_MS = 30000;

let activeTextarea = null;
let currentResult = null;
let requestSerial = 0;
let visionSkipResolver = null;
const visionCache = new Map();

function byId(id) {
  return document.getElementById(id);
}

function injectStyles() {
  const previous = byId('seedance-ai-prompt-styles');
  if (previous) previous.remove();

  const style = document.createElement('style');
  style.id = 'seedance-ai-prompt-styles';
  style.textContent = `
    body.ai-prompt-open{overflow:hidden!important}
    body.ai-prompt-open #quick-segment-modal{opacity:0!important;pointer-events:none!important}

    body .ai-prompt-heading{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;min-height:30px!important;margin:0 0 8px!important}
    body .ai-prompt-heading>span{margin:0!important;color:#435169!important;font-size:13px!important;font-weight:760!important}
    body .ai-prompt-button{width:auto!important;min-width:0!important;height:30px!important;min-height:30px!important;margin:0!important;padding:0 10px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;border:1px solid #4657ce!important;border-radius:7px!important;color:#fff!important;font-size:12px!important;font-weight:760!important;line-height:1!important;white-space:nowrap!important;background:#5263df!important;box-shadow:none!important}
    body .ai-prompt-button:hover{border-color:#3d4ec1!important;color:#fff!important;background:#4455cf!important}

    body .ai-prompt-modal{position:fixed!important;inset:0!important;z-index:5000!important;padding:24px!important;display:grid!important;place-items:center!important;background:rgba(15,23,42,.48)!important;backdrop-filter:blur(14px) saturate(.82)!important;-webkit-backdrop-filter:blur(14px) saturate(.82)!important}
    body .ai-prompt-modal[hidden]{display:none!important}
    body .ai-prompt-card{width:min(1120px,95vw)!important;max-height:90vh!important;display:grid!important;grid-template-rows:auto minmax(0,1fr) auto auto!important;overflow:hidden!important;border:1px solid #cbd4e1!important;border-top:4px solid #5263df!important;border-radius:16px!important;color:#111827!important;background:#fff!important;box-shadow:0 28px 80px rgba(15,23,42,.28)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}

    body .ai-prompt-top{padding:18px 20px 16px!important;display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:20px!important;border-bottom:1px solid #e2e7ef!important;background:#f7f8ff!important}
    body .ai-prompt-top h3{margin:0!important;color:#111827!important;font-size:22px!important;font-weight:820!important;letter-spacing:-.03em!important}
    body .ai-prompt-top p{max-width:900px!important;margin:5px 0 0!important;color:#667085!important;font-size:12px!important;line-height:1.6!important}
    body .ai-prompt-close{width:35px!important;height:35px!important;min-height:35px!important;padding:0!important;border:1px solid #d1d8e3!important;border-radius:9px!important;color:#475467!important;font-size:20px!important;line-height:1!important;background:#fff!important;box-shadow:none!important}
    body .ai-prompt-close:hover{border-color:#aeb9ca!important;background:#f2f4f7!important}

    body .ai-prompt-body{min-height:0!important;padding:16px 20px 18px!important;display:flex!important;flex-direction:column!important;gap:14px!important;overflow-y:auto!important;background:#f7f9fc!important}
    body .ai-prompt-mode-section,body .ai-prompt-options,body .ai-prompt-vision-state,body .ai-prompt-column,body .ai-prompt-meta section{border:1px solid #e0e6ef!important;border-radius:11px!important;background:#fff!important}
    body .ai-prompt-mode-section{padding:14px!important}
    body .ai-prompt-mode-title{margin:0 0 10px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;color:#344054!important;font-size:13px!important;font-weight:790!important}
    body .ai-prompt-mode-title small{color:#98a2b3!important;font-size:11px!important;font-weight:620!important}
    body .ai-prompt-mode-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:12px!important}
    body .ai-prompt-mode-card{position:relative!important;min-height:88px!important;padding:14px 14px 13px 45px!important;display:block!important;border:1px solid #d8dee8!important;border-radius:10px!important;color:#344054!important;background:#fafbfc!important;cursor:pointer!important}
    body .ai-prompt-mode-card:hover{border-color:#b9c3ff!important;background:#f6f7ff!important}
    body .ai-prompt-mode-card.selected{border-color:#9daaff!important;background:#eff1ff!important;box-shadow:inset 0 0 0 1px rgba(82,99,223,.08)!important}
    body .ai-prompt-mode-card input{position:absolute!important;left:15px!important;top:18px!important;width:18px!important;height:18px!important;min-height:18px!important;margin:0!important;accent-color:#5263df!important}
    body .ai-prompt-mode-card strong{display:block!important;margin:0 0 5px!important;color:#111827!important;font-size:14px!important;font-weight:800!important}
    body .ai-prompt-mode-card span{display:block!important;max-width:90%!important;color:#667085!important;font-size:12px!important;line-height:1.48!important}
    body .ai-prompt-mode-card em{position:absolute!important;right:10px!important;top:10px!important;padding:3px 7px!important;border-radius:999px!important;color:#475467!important;font-size:10px!important;font-style:normal!important;font-weight:720!important;background:#edf0f4!important}
    body .ai-prompt-mode-card.selected em{color:#4353cb!important;background:#e1e5ff!important}

    body .ai-prompt-vision-state{padding:11px 13px!important;display:grid!important;grid-template-columns:36px minmax(0,1fr) auto!important;align-items:center!important;gap:11px!important}
    body .ai-prompt-vision-state[hidden]{display:none!important}
    body .ai-prompt-vision-icon{width:36px!important;height:36px!important;display:grid!important;place-items:center!important;border-radius:10px!important;color:#4353cb!important;font-size:13px!important;font-weight:850!important;background:#e9edff!important}
    body .ai-prompt-vision-copy strong{display:block!important;color:#111827!important;font-size:13px!important;font-weight:790!important}
    body .ai-prompt-vision-copy span{display:block!important;margin-top:2px!important;color:#667085!important;font-size:12px!important;line-height:1.45!important}
    body .ai-prompt-vision-count{color:#5263df!important;font-size:12px!important;font-weight:780!important}
    body .ai-prompt-vision-state.running{border-color:#bbc4ff!important;background:#f6f7ff!important}
    body .ai-prompt-vision-state.ok{border-color:#b7dfd3!important;background:#f3fbf8!important}
    body .ai-prompt-vision-state.warning{border-color:#ead8ac!important;background:#fffaf0!important}

    body .ai-prompt-options{padding:10px 13px!important}
    body .ai-prompt-options summary{cursor:pointer!important;color:#344054!important;font-size:13px!important;font-weight:770!important}
    body .ai-prompt-option-row{margin-top:10px!important;display:flex!important;align-items:end!important;gap:10px!important}
    body .ai-prompt-option-row label{flex:1!important}
    body .ai-prompt-option-row span{display:block!important;margin-bottom:6px!important;color:#667085!important;font-size:12px!important;font-weight:700!important}
    body .ai-prompt-option-row select{width:100%!important;min-height:42px!important;padding:9px 11px!important;border:1px solid #d5dce7!important;border-radius:8px!important;color:#111827!important;background:#fff!important;box-shadow:none!important}

    body .ai-prompt-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:14px!important}
    body .ai-prompt-column{min-width:0!important;padding:13px!important}
    body .ai-prompt-column h4{margin:0 0 9px!important;color:#344054!important;font-size:13px!important;font-weight:780!important}
    body .ai-prompt-column textarea{width:100%!important;min-height:270px!important;padding:13px 14px!important;resize:vertical!important;border:1px solid #d5dce7!important;border-radius:8px!important;color:#111827!important;font-size:14px!important;line-height:1.68!important;background:#fff!important;box-shadow:none!important}
    body .ai-prompt-column textarea[readonly]{color:#526174!important;background:#f6f8fa!important}
    body .ai-prompt-column textarea:focus{border-color:#6878e3!important;box-shadow:0 0 0 3px #eef0ff!important;outline:none!important}

    body .ai-prompt-meta{display:grid!important;grid-template-columns:1fr 1fr!important;gap:14px!important}
    body .ai-prompt-meta section{padding:11px 12px!important}
    body .ai-prompt-meta strong{display:block!important;margin-bottom:6px!important;color:#344054!important;font-size:12px!important;font-weight:780!important}
    body .ai-prompt-meta ul{margin:0!important;padding-left:17px!important;color:#667085!important;font-size:12px!important;line-height:1.55!important}

    body .ai-prompt-progress-wrap{padding:10px 20px!important;display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;gap:14px!important;border-top:1px solid #e1e6ee!important;background:#fff!important}
    body .ai-prompt-progress{height:5px!important;overflow:hidden!important;border-radius:999px!important;background:#e8ecf2!important}
    body .ai-prompt-progress i{display:block!important;width:0;height:100%!important;border-radius:inherit!important;background:#5263df!important;transition:width .18s ease!important}
    body .ai-prompt-status{min-height:22px!important;margin-top:5px!important;color:#667085!important;font-size:12px!important;line-height:1.45!important;overflow-wrap:anywhere!important}
    body .ai-prompt-status.error{color:#cf4057!important}
    body .ai-prompt-status.ok{color:#087a5b!important}
    body .ai-prompt-skip{min-height:34px!important;padding:0 11px!important;border:1px solid #ccd4df!important;border-radius:8px!important;color:#344054!important;font-size:12px!important;font-weight:730!important;background:#fff!important;box-shadow:none!important}

    body .ai-prompt-actions{padding:13px 20px 16px!important;display:flex!important;justify-content:flex-end!important;gap:9px!important;border-top:1px solid #e1e6ee!important;background:#fff!important}
    body .ai-prompt-actions button{min-height:40px!important;padding:0 14px!important;border-radius:8px!important;font-size:14px!important;font-weight:760!important;box-shadow:none!important}
    body .ai-prompt-secondary{border:1px solid #ccd4df!important;color:#26354a!important;background:#fff!important}
    body .ai-prompt-secondary:hover{border-color:#aeb9ca!important;background:#f3f5f8!important}
    body .ai-prompt-run{border:1px solid #4657ce!important;color:#fff!important;background:#5263df!important}
    body .ai-prompt-run:hover{background:#4455cf!important}
    body .ai-prompt-primary{border:1px solid #087a5b!important;color:#fff!important;background:#099268!important}
    body .ai-prompt-primary:hover{background:#087a5b!important}
    body .ai-prompt-actions button:disabled{opacity:.48!important;cursor:not-allowed!important}

    @media(max-width:800px){
      body .ai-prompt-modal{padding:10px!important}
      body .ai-prompt-card{width:min(720px,97vw)!important;max-height:95vh!important}
      body .ai-prompt-body{padding:12px!important}
      body .ai-prompt-mode-grid,body .ai-prompt-grid,body .ai-prompt-meta{grid-template-columns:1fr!important}
      body .ai-prompt-column textarea{min-height:210px!important}
      body .ai-prompt-option-row{align-items:stretch!important;flex-direction:column!important}
      body .ai-prompt-progress-wrap{grid-template-columns:1fr!important}
      body .ai-prompt-skip{justify-self:start!important}
    }
  `;
  document.head.appendChild(style);
}

function ensureModal() {
  if (byId('ai-prompt-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'ai-prompt-modal';
  modal.className = 'ai-prompt-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="ai-prompt-card" role="dialog" aria-modal="true" aria-labelledby="ai-prompt-title">
      <header class="ai-prompt-top">
        <div>
          <h3 id="ai-prompt-title">AI 优化提示词</h3>
          <p>先选择优化方式，再开始处理。快速模式只优化文字；精细模式会先显示千问视觉理解进度，再交给 DeepSeek 结合画面优化。</p>
        </div>
        <button type="button" class="ai-prompt-close" id="ai-prompt-close" aria-label="关闭">×</button>
      </header>

      <div class="ai-prompt-body">
        <section class="ai-prompt-mode-section">
          <div class="ai-prompt-mode-title">
            <span>选择优化方式</span>
            <small>选择后点击底部“开始优化”</small>
          </div>
          <div class="ai-prompt-mode-grid">
            <label class="ai-prompt-mode-card selected" data-optimizer-mode-card="fast">
              <input type="radio" name="ai-prompt-mode" id="ai-prompt-mode-fast" value="fast" checked>
              <strong>文字快速优化</strong>
              <span>直接根据原提示词、项目参数和素材引用优化，不调用图片视觉理解。</span>
              <em>速度优先</em>
            </label>
            <label class="ai-prompt-mode-card" data-optimizer-mode-card="vision">
              <input type="radio" name="ai-prompt-mode" id="ai-prompt-mode-vision" value="vision">
              <strong>图片精细优化</strong>
              <span>先由千问并行理解最多 3 张代表图片，再由 DeepSeek 结合文字精细优化。</span>
              <em>画面理解</em>
            </label>
          </div>
        </section>

        <section class="ai-prompt-vision-state" id="ai-prompt-vision-state" hidden>
          <div class="ai-prompt-vision-icon">Q</div>
          <div class="ai-prompt-vision-copy">
            <strong>千问视觉理解</strong>
            <span id="ai-prompt-vision-message">等待开始图片识别</span>
          </div>
          <div class="ai-prompt-vision-count" id="ai-prompt-vision-count">0/0</div>
        </section>

        <details class="ai-prompt-options">
          <summary>高级选项</summary>
          <div class="ai-prompt-option-row">
            <label>
              <span>优化策略</span>
              <select id="ai-prompt-strategy">
                <option value="auto">自动识别（推荐）</option>
                <option value="conservative">保守优化</option>
                <option value="camera">运镜强化</option>
                <option value="strict">严格锁定</option>
                <option value="concise">精简表达</option>
              </select>
            </label>
          </div>
        </details>

        <div class="ai-prompt-grid">
          <section class="ai-prompt-column">
            <h4>原始提示词</h4>
            <textarea id="ai-prompt-original" readonly></textarea>
          </section>
          <section class="ai-prompt-column">
            <h4>AI 优化结果（可继续手动修改）</h4>
            <textarea id="ai-prompt-optimized" placeholder="选择优化方式后，点击开始优化"></textarea>
          </section>
        </div>

        <div class="ai-prompt-meta">
          <section><strong>主要优化点</strong><ul id="ai-prompt-changes"><li>尚未开始优化</li></ul></section>
          <section><strong>风险与提醒</strong><ul id="ai-prompt-warnings"><li>尚未开始检查</li></ul></section>
        </div>
      </div>

      <div class="ai-prompt-progress-wrap">
        <div>
          <div class="ai-prompt-progress"><i id="ai-prompt-progress-fill"></i></div>
          <div class="ai-prompt-status" id="ai-prompt-status">请选择优化方式。</div>
        </div>
        <button type="button" class="ai-prompt-skip" id="ai-prompt-skip-vision" hidden>跳过图片理解</button>
      </div>

      <footer class="ai-prompt-actions">
        <button type="button" class="ai-prompt-secondary" id="ai-prompt-cancel">取消</button>
        <button type="button" class="ai-prompt-run" id="ai-prompt-run">开始快速优化</button>
        <button type="button" class="ai-prompt-primary" id="ai-prompt-use" hidden disabled>使用优化版</button>
      </footer>
    </div>`;

  document.body.appendChild(modal);

  byId('ai-prompt-close').onclick = closeModal;
  byId('ai-prompt-cancel').onclick = closeModal;
  byId('ai-prompt-run').onclick = () => runOptimization();
  byId('ai-prompt-use').onclick = applyResult;
  byId('ai-prompt-skip-vision').onclick = requestVisionSkip;

  modal.querySelectorAll('input[name="ai-prompt-mode"]').forEach(input => {
    input.addEventListener('change', handleOptimizationModeChange);
  });

  modal.addEventListener('click', event => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });
}

function selectedOptimizationMode() {
  return document.querySelector('input[name="ai-prompt-mode"]:checked')?.value === 'vision'
    ? 'vision'
    : 'fast';
}

function setOptimizationMode(mode) {
  const normalized = mode === 'vision' ? 'vision' : 'fast';
  const input = byId(`ai-prompt-mode-${normalized}`);
  if (input) input.checked = true;
  syncOptimizationModeUI();
}

function syncOptimizationModeUI() {
  const selected = selectedOptimizationMode();
  document.querySelectorAll('[data-optimizer-mode-card]').forEach(card => {
    card.classList.toggle('selected', card.dataset.optimizerModeCard === selected);
  });
}

function setVisionState(message = '', stateName = '', count = '') {
  const box = byId('ai-prompt-vision-state');
  const messageEl = byId('ai-prompt-vision-message');
  const countEl = byId('ai-prompt-vision-count');
  if (!box) return;

  const visible = selectedOptimizationMode() === 'vision';
  box.hidden = !visible;
  box.className = `ai-prompt-vision-state ${stateName}`.trim();
  if (messageEl) messageEl.textContent = message || '等待开始图片识别';
  if (countEl) countEl.textContent = count || '0/0';
}

function updateRunButtonLabel() {
  const run = byId('ai-prompt-run');
  if (!run) return;
  run.textContent = selectedOptimizationMode() === 'vision'
    ? '开始图片精细优化'
    : '开始文字快速优化';
}

function handleOptimizationModeChange() {
  requestSerial += 1;
  currentResult = null;
  syncOptimizationModeUI();
  updateRunButtonLabel();

  const optimized = byId('ai-prompt-optimized');
  const use = byId('ai-prompt-use');
  const run = byId('ai-prompt-run');
  if (optimized) optimized.value = '';
  if (use) {
    use.hidden = true;
    use.disabled = true;
  }
  if (run) run.hidden = false;

  setProgress(0);
  renderList('ai-prompt-changes', [], '尚未开始优化');
  renderList('ai-prompt-warnings', [], '尚未开始检查');

  if (selectedOptimizationMode() === 'vision') {
    const count = visibleImageCandidates().length;
    setVisionState(
      count
        ? `已找到 ${count} 张代表图片。点击开始后将调用千问视觉理解。`
        : '当前没有识别到可分析图片，开始后会自动降级为文字优化。',
      '',
      `0/${count}`,
    );
    setStatus('已选择图片精细优化，尚未开始。');
  } else {
    setVisionState('', '', '');
    setStatus('已选择文字快速优化，尚未开始。');
  }
}


function setStatus(message, type = '') {
  const el = byId('ai-prompt-status');
  if (!el) return;
  el.textContent = message || '';
  el.className = `ai-prompt-status ${type}`.trim();
}

function setProgress(value) {
  const el = byId('ai-prompt-progress-fill');
  if (!el) return;
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  el.style.width = `${safeValue}%`;
}

function setBusy(busy) {
  const run = byId('ai-prompt-run');
  const use = byId('ai-prompt-use');
  const strategy = byId('ai-prompt-strategy');

  if (run) {
    run.disabled = busy;
    if (busy) run.textContent = selectedOptimizationMode() === 'vision'
      ? '正在精细优化…'
      : '正在快速优化…';
    else updateRunButtonLabel();
  }
  if (strategy) strategy.disabled = busy;
  document.querySelectorAll('input[name="ai-prompt-mode"]').forEach(input => {
    input.disabled = busy;
  });
  if (use) use.disabled = busy || !currentResult;
}

function renderList(id, items, fallback) {
  const el = byId(id);
  if (!el) return;
  const values = Array.isArray(items) && items.length ? items : [fallback];
  el.innerHTML = values.map(item => `<li>${escapeHtml(String(item || ''))}</li>`).join('');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char]);
}

function activeMode() {
  const explicit = String(document.body.dataset.projectMode || '').trim();
  if (['first_last', 'multi_frame', 'text_only'].includes(explicit)) return explicit;

  const label = String(byId('locked-mode-label')?.textContent || '');
  if (label.includes('纯文字')) return 'text_only';
  if (label.includes('首尾')) return 'first_last';
  return 'multi_frame';
}

function currentFrames() {
  const names = [];
  document.querySelectorAll('#editor-timeline img, #quick-timeline img').forEach(img => {
    const value = img.getAttribute('alt') || img.getAttribute('title') || img.closest('.frame-card')?.textContent || '';
    const cleaned = String(value).replace(/\s+/g, ' ').trim();
    if (cleaned && !names.includes(cleaned)) names.push(cleaned);
  });
  return names;
}

function currentReferences() {
  return [...document.querySelectorAll('#reference-video-preview .reference-pool-item')]
    .map(item => {
      const token = item.querySelector('strong')?.textContent?.trim() || '';
      const name = item.querySelector('em')?.textContent?.trim() || '';
      const type = item.querySelector('.reference-video-meta span')?.textContent?.trim() || '';
      return { token, name, type };
    })
    .filter(item => item.token || item.name);
}

function visibleImageCandidates() {
  const mode = activeMode();
  const selectors = mode === 'text_only'
    ? ['#reference-video-preview img']
    : ['#quick-timeline img', '#editor-timeline img'];

  const seen = new Set();
  const images = [];

  selectors.forEach(selector => {
    document.querySelectorAll(selector).forEach((img, index) => {
      const src = String(img.currentSrc || img.src || '').trim();
      if (!src || seen.has(src)) return;
      if (src.startsWith('data:video/') || src.startsWith('data:audio/')) return;
      seen.add(src);
      images.push({
        src,
        label: String(
          img.getAttribute('alt') ||
          img.getAttribute('title') ||
          img.closest('.frame-card, .reference-pool-item')?.querySelector('strong, em')?.textContent ||
          `图片${index + 1}`
        ).replace(/\s+/g, ' ').trim(),
      });
    });
  });

  return representativeImages(images, MAX_VISION_IMAGES);
}

function representativeImages(images, maxCount) {
  if (!Array.isArray(images) || images.length <= maxCount) return images || [];
  if (maxCount <= 1) return [images[0]];
  if (maxCount === 2) return [images[0], images[images.length - 1]];

  const indexes = new Set([0, Math.floor((images.length - 1) / 2), images.length - 1]);
  return [...indexes].sort((a, b) => a - b).map(index => images[index]);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取本地图片失败'));
    reader.readAsDataURL(blob);
  });
}

async function imageSourceForVision(src) {
  if (src.startsWith('data:image/')) return src;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  if (!src.startsWith('blob:')) throw new Error('图片地址格式不受支持');

  const response = await withTimeout(fetch(src), 8000, '读取本地图片超时');
  if (!response.ok) throw new Error(`读取本地图片失败：HTTP ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('当前素材不是图片');
  return blobToDataUrl(blob);
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function visionCacheKey(candidate) {
  const src = String(candidate?.src || '');
  if (src.startsWith('data:')) {
    return `${candidate.label || ''}:${src.length}:${src.slice(-80)}`;
  }
  return src;
}

async function analyzeSingleImage(candidate, index) {
  const cacheKey = visionCacheKey(candidate);
  if (visionCache.has(cacheKey)) return visionCache.get(cacheKey);

  const imageUrl = await imageSourceForVision(candidate.src);
  const response = await withTimeout(
    supabase.functions.invoke(VISION_FUNCTION_NAME, {
      body: {
        image_url: imageUrl,
        prompt: '请准确分析这张图片，为 Davis Video 视频提示词优化提供主体、场景、构图、镜头、光影、色彩、关键元素、可行动作、保持规则和避免规则。',
      },
    }),
    VISION_TIMEOUT_MS,
    `图片 ${index + 1} 视觉理解超过 15 秒`,
  );

  const { data, error } = response || {};
  if (error) throw new Error(error.message || '视觉分析服务调用失败');
  if (!data?.ok || !data?.vision_context) {
    throw new Error(data?.error || '千问没有返回有效视觉结果');
  }

  const result = {
    index: index + 1,
    label: candidate.label || `图片${index + 1}`,
    model: data.model || 'qwen-vl-plus',
    analysis: data.vision_context,
  };
  visionCache.set(cacheKey, result);
  return result;
}

function requestVisionSkip() {
  if (!visionSkipResolver) return;
  visionSkipResolver();
  visionSkipResolver = null;
  setStatus('已跳过图片理解，正在改用文字快速优化…');
  setProgress(55);
}

async function analyzeImagesForPrompt(serial) {
  const candidates = visibleImageCandidates();
  if (!candidates.length) {
    setVisionState(
      '没有找到可用于视觉理解的图片，已自动降级为文字快速优化。',
      'warning',
      '0/0',
    );
    return {
      context: null,
      warnings: ['当前项目没有可用于视觉理解的图片，已按文字快速优化。'],
    };
  }

  let completed = 0;
  setVisionState(
    `千问正在并行理解 ${candidates.length} 张代表图片，单张最长等待 15 秒。`,
    'running',
    `0/${candidates.length}`,
  );
  setStatus(`千问视觉理解进行中：0/${candidates.length}`);
  setProgress(18);

  const skipButton = byId('ai-prompt-skip-vision');
  if (skipButton) skipButton.hidden = false;

  const tasks = candidates.map((candidate, index) => (
    analyzeSingleImage(candidate, index).finally(() => {
      completed += 1;
      if (serial !== requestSerial) return;
      setVisionState(
        `千问正在理解画面主体、构图、光影和镜头信息。`,
        'running',
        `${completed}/${candidates.length}`,
      );
      setStatus(`千问视觉理解进行中：${completed}/${candidates.length}`);
      setProgress(18 + Math.round((completed / candidates.length) * 34));
    })
  ));

  const analysisPromise = Promise.allSettled(tasks);
  const skipPromise = new Promise(resolve => {
    visionSkipResolver = () => resolve({ skipped: true });
  });

  const outcome = await Promise.race([analysisPromise, skipPromise]);
  visionSkipResolver = null;
  if (skipButton) skipButton.hidden = true;

  if (serial !== requestSerial) return { cancelled: true, context: null, warnings: [] };
  if (outcome?.skipped) {
    setVisionState(
      '已跳过千问视觉理解，正在改用文字快速优化。',
      'warning',
      `${completed}/${candidates.length}`,
    );
    return {
      context: null,
      warnings: ['用户已跳过图片视觉理解，本次按文字快速优化。'],
      skipped: true,
    };
  }

  const successful = [];
  const failures = [];
  outcome.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value?.analysis) {
      successful.push(result.value);
    } else {
      failures.push(
        result.reason?.message ||
        `${candidates[index]?.label || `图片${index + 1}`}视觉理解失败`,
      );
    }
  });

  const warnings = failures.length
    ? [`${failures.length} 张图片未能完成视觉理解，已自动跳过，不影响文字优化。`]
    : [];

  if (!successful.length) {
    warnings.push('图片视觉理解不可用，本次已自动降级为文字快速优化。');
    setVisionState(
      '千问视觉理解未返回有效结果，已自动降级为文字优化。',
      'warning',
      `0/${candidates.length}`,
    );
    return { context: null, warnings };
  }

  setVisionState(
    `千问已完成 ${successful.length} 张图片理解，正在交给 DeepSeek 精细优化。`,
    'ok',
    `${successful.length}/${candidates.length}`,
  );

  return {
    context: {
      source: 'qwen-vl-plus',
      image_count: successful.length,
      images: successful,
    },
    warnings,
  };
}

function contextFor(textarea) {
  const mode = activeMode();
  return buildOptimizationPayload({
    prompt: textarea?.value || '',
    mode,
    strategy: byId('ai-prompt-strategy')?.value || 'auto',
    ratio: byId('project-ratio')?.value || byId('segment-ratio')?.value || '',
    duration: byId('segment-duration')?.value || null,
    resolution: byId('segment-resolution')?.value || '',
    generateAudio: byId('segment-audio')?.value === 'true',
    segmentLabel: mode === 'text_only' ? '纯文字生成' : (byId('inspector-name')?.textContent || ''),
    frames: currentFrames(),
    references: currentReferences(),
  });
}

function openFor(textarea) {
  if (!textarea) return;
  const prompt = textarea.value.trim();
  if (!prompt) {
    showToast('请先填写提示词', '写下基本想法后再使用 AI 优化。');
    textarea.focus();
    return;
  }

  activeTextarea = textarea;
  currentResult = null;
  byId('ai-prompt-original').value = prompt;
  byId('ai-prompt-optimized').value = '';
  byId('ai-prompt-use').hidden = true;
  byId('ai-prompt-use').disabled = true;
  byId('ai-prompt-run').hidden = false;
  setOptimizationMode('fast');
  renderList('ai-prompt-changes', [], '尚未开始优化');
  renderList('ai-prompt-warnings', [], '尚未开始检查');
  setProgress(0);
  setStatus('已选择文字快速优化，点击“开始文字快速优化”。');
  setVisionState('', '', '');
  updateRunButtonLabel();

  byId('ai-prompt-modal').hidden = false;
  document.body.classList.add('ai-prompt-open');
}

async function runOptimization() {
  if (!activeTextarea) return;
  const prompt = activeTextarea.value.trim();
  if (!prompt) return;

  const serial = ++requestSerial;
  const optimizerMode = selectedOptimizationMode();
  const extraWarnings = [];
  currentResult = null;
  setBusy(true);
  byId('ai-prompt-use').hidden = true;
  byId('ai-prompt-optimized').value = '';
  renderList('ai-prompt-changes', [], '正在生成');
  renderList('ai-prompt-warnings', [], '正在检查');
  setProgress(12);

  try {
    const payload = contextFor(activeTextarea);

    if (optimizerMode === 'vision') {
      const visionResult = await analyzeImagesForPrompt(serial);
      if (serial !== requestSerial || visionResult?.cancelled) return;
      if (visionResult?.context) payload.vision_context = visionResult.context;
      if (Array.isArray(visionResult?.warnings)) extraWarnings.push(...visionResult.warnings);
    } else {
      const skipButton = byId('ai-prompt-skip-vision');
      if (skipButton) skipButton.hidden = true;
      setVisionState('', '', '');
      setStatus('正在根据文字、项目参数和素材引用快速优化…');
    }

    if (serial !== requestSerial) return;
    setProgress(62);
    setStatus(
      payload.vision_context
        ? `已理解 ${payload.vision_context.image_count} 张图片，正在结合文字生成优化结果…`
        : '正在生成文字优化结果…',
    );

    const response = await withTimeout(
      supabase.functions.invoke(FUNCTION_NAME, { body: payload }),
      OPTIMIZE_TIMEOUT_MS,
      '提示词优化超过 30 秒，请检查网络或稍后重试',
    );
    if (serial !== requestSerial) return;

    const { data, error } = response || {};
    if (error) throw new Error(error.message || '调用优化服务失败');
    if (!data?.ok) throw new Error(data?.error || 'DeepSeek 没有返回有效结果');

    const optimized = String(data.optimized_prompt || '').trim();
    if (!optimized) throw new Error('优化结果为空，请重新优化');

    const missing = missingReferenceTokens(prompt, optimized);
    if (missing.length) throw new Error(`优化结果丢失素材引用：${missing.join('、')}`);

    const warnings = [
      ...(Array.isArray(data.warnings) ? data.warnings : []),
      ...extraWarnings,
    ];

    currentResult = { ...data, warnings };
    byId('ai-prompt-optimized').value = optimized;
    byId('ai-prompt-use').hidden = false;
    byId('ai-prompt-run').hidden = false;
    renderList('ai-prompt-changes', data.changes, '已整理表达和镜头逻辑');
    renderList('ai-prompt-warnings', warnings, '未发现明显冲突');
    setProgress(100);
    setStatus(
      `优化完成 · ${data.model || 'DeepSeek'}${payload.vision_context ? ` + 千问理解 ${payload.vision_context.image_count} 张图片` : ' · 文字快速模式'} · 未自动覆盖原文`,
      'ok',
    );
  } catch (error) {
    currentResult = null;
    byId('ai-prompt-use').hidden = true;
    setProgress(100);
    setStatus(error?.message || String(error), 'error');
    renderList('ai-prompt-changes', [], '本次优化未完成');
    renderList(
      'ai-prompt-warnings',
      extraWarnings,
      '请检查 DeepSeek API Key、余额、网络或 Edge Function 状态后重试',
    );
  } finally {
    visionSkipResolver = null;
    const skipButton = byId('ai-prompt-skip-vision');
    if (skipButton) skipButton.hidden = true;
    setBusy(false);
  }
}

function applyResult() {
  if (!activeTextarea) return;
  const optimized = byId('ai-prompt-optimized').value.trim();
  if (!optimized) return;

  const missing = missingReferenceTokens(activeTextarea.value, optimized);
  if (missing.length) {
    setStatus(`不能替换：缺少素材引用 ${missing.join('、')}`, 'error');
    return;
  }

  activeTextarea.value = optimized;
  activeTextarea.dispatchEvent(new Event('input', { bubbles: true }));
  activeTextarea.dispatchEvent(new Event('change', { bubbles: true }));
  closeModal();
  showToast('已使用优化版', '优化提示词已写回当前草稿。原文没有单独保存。');
}

function closeModal() {
  requestSerial += 1;
  if (visionSkipResolver) visionSkipResolver();
  visionSkipResolver = null;
  const modal = byId('ai-prompt-modal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('ai-prompt-open');
  activeTextarea = null;
  currentResult = null;
}

function showToast(title, message) {
  const titleEl = byId('toast-title');
  const messageEl = byId('toast-message');
  const toast = byId('toast');
  if (!toast || !titleEl || !messageEl) return;
  titleEl.textContent = title;
  messageEl.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 3600);
}

function wireButtons() {
  byId('ai-optimize-text-prompt')?.addEventListener('click', () => openFor(byId('text-mode-prompt')));
  byId('ai-optimize-segment-prompt')?.addEventListener('click', () => openFor(byId('segment-prompt')));
  byId('ai-optimize-quick-segment-prompt')?.addEventListener('click', () => openFor(byId('quick-segment-prompt')));
}

function init() {
  injectStyles();
  ensureModal();
  wireButtons();
  document.body.dataset.promptOptimizerBuild = BUILD;
  console.log('[Davis Video Prompt Optimizer]', BUILD);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

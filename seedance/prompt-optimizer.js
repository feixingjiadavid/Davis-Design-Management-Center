import { supabase } from '../supabase-config.js';
import {
  buildOptimizationPayload,
  missingReferenceTokens,
} from './prompt-optimizer-core.js';

const BUILD = '20260724-qwen-vision-deepseek-prompt-optimizer-v2';
const FUNCTION_NAME = 'seedance-prompt-optimize';
const VISION_FUNCTION_NAME = 'seedance-vision-analyze';
const MAX_VISION_IMAGES = 6;

let activeTextarea = null;
let currentResult = null;
let requestSerial = 0;

function byId(id) {
  return document.getElementById(id);
}

function injectStyles() {
  if (byId('seedance-ai-prompt-styles')) return;
  const style = document.createElement('style');
  style.id = 'seedance-ai-prompt-styles';
  style.textContent = `
    .ai-prompt-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:7px}
    .ai-prompt-heading>span{margin:0!important}
    .ai-prompt-button{width:auto!important;padding:7px 10px!important;font-size:10px!important;color:#d8d4ff!important;border-color:rgba(139,92,246,.35)!important;background:rgba(109,93,252,.10)!important}
    .ai-prompt-button:hover{background:rgba(109,93,252,.20)!important}
    .ai-prompt-modal{position:fixed;inset:0;z-index:3000;display:grid;place-items:center;padding:22px;background:rgba(3,4,8,.78);backdrop-filter:blur(14px)}
    .ai-prompt-card{width:min(1120px,96vw);max-height:92vh;overflow:auto;background:linear-gradient(180deg,#171a22,#101218);border:1px solid rgba(255,255,255,.14);border-radius:22px;box-shadow:0 35px 100px rgba(0,0,0,.55)}
    .ai-prompt-top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:22px 24px 18px;border-bottom:1px solid rgba(255,255,255,.08)}
    .ai-prompt-top h3{margin:0;font-size:18px}.ai-prompt-top p{margin:7px 0 0;color:#8d92a1;font-size:11px;line-height:1.55}
    .ai-prompt-close{border:1px solid rgba(255,255,255,.1);background:#1b1e27;color:#ddd;width:34px;height:34px;border-radius:10px;font-size:18px}
    .ai-prompt-options{padding:14px 24px;border-bottom:1px solid rgba(255,255,255,.07)}
    .ai-prompt-options details{font-size:11px;color:#9a9faf}.ai-prompt-options summary{cursor:pointer;color:#c9cbd4;font-weight:800}
    .ai-prompt-option-row{display:flex;align-items:end;gap:12px;margin-top:12px}.ai-prompt-option-row label{flex:1}.ai-prompt-option-row span{display:block;font-size:10px;color:#737987;margin-bottom:6px}
    .ai-prompt-option-row select{width:100%;border:1px solid rgba(255,255,255,.1);background:#0b0d12;color:#fff;border-radius:10px;padding:10px}
    .ai-prompt-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px 24px}
    .ai-prompt-column{min-width:0}.ai-prompt-column h4{margin:0 0 9px;font-size:12px;color:#dfe2eb}
    .ai-prompt-column textarea{min-height:330px;width:100%;resize:vertical;border:1px solid rgba(255,255,255,.1);background:#0a0c11;color:#f4f5f7;border-radius:14px;padding:15px;line-height:1.7;font-size:12px}
    .ai-prompt-column textarea[readonly]{color:#aeb3c0}
    .ai-prompt-meta{padding:0 24px 18px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .ai-prompt-meta section{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025);border-radius:13px;padding:12px}
    .ai-prompt-meta strong{display:block;font-size:10px;margin-bottom:7px}.ai-prompt-meta ul{margin:0;padding-left:18px;color:#9399a8;font-size:10px;line-height:1.7}
    .ai-prompt-status{padding:0 24px 14px;color:#9aa0ad;font-size:11px}.ai-prompt-status.error{color:#ff8090}.ai-prompt-status.ok{color:#42d39b}
    .ai-prompt-actions{display:flex;justify-content:flex-end;gap:10px;padding:16px 24px 22px;border-top:1px solid rgba(255,255,255,.08)}
    .ai-prompt-actions button{border-radius:11px;padding:10px 14px;font-weight:800}
    .ai-prompt-secondary{border:1px solid rgba(255,255,255,.1);background:#171a22;color:#d7dae3}.ai-prompt-primary{border:0;background:linear-gradient(135deg,#6d5dfc,#8b5cf6);color:#fff}
    @media(max-width:800px){.ai-prompt-grid,.ai-prompt-meta{grid-template-columns:1fr}.ai-prompt-column textarea{min-height:230px}.ai-prompt-option-row{align-items:stretch;flex-direction:column}}
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
      <div class="ai-prompt-top">
        <div><h3 id="ai-prompt-title">AI 优化提示词</h3><p>上传的图片会先由千问视觉模型理解，再将视觉分析结果与原提示词一并交给 DeepSeek 优化。视频和音频本体不会上传给视觉模型，优化结果不会自动覆盖原文。</p></div>
        <button type="button" class="ai-prompt-close" id="ai-prompt-close" aria-label="关闭">×</button>
      </div>
      <div class="ai-prompt-options">
        <details>
          <summary>高级选项</summary>
          <div class="ai-prompt-option-row">
            <label><span>优化策略</span><select id="ai-prompt-strategy"><option value="auto">自动识别（推荐）</option><option value="conservative">保守优化</option><option value="camera">运镜强化</option><option value="strict">严格锁定</option><option value="concise">精简表达</option></select></label>
            <button type="button" class="ai-prompt-secondary" id="ai-prompt-rerun">按当前策略重新优化</button>
          </div>
        </details>
      </div>
      <div class="ai-prompt-grid">
        <div class="ai-prompt-column"><h4>原始提示词</h4><textarea id="ai-prompt-original" readonly></textarea></div>
        <div class="ai-prompt-column"><h4>AI 优化结果（可继续手动修改）</h4><textarea id="ai-prompt-optimized" placeholder="正在生成优化结果..."></textarea></div>
      </div>
      <div class="ai-prompt-meta">
        <section><strong>主要优化点</strong><ul id="ai-prompt-changes"><li>等待优化结果</li></ul></section>
        <section><strong>风险与提醒</strong><ul id="ai-prompt-warnings"><li>等待优化结果</li></ul></section>
      </div>
      <div class="ai-prompt-status" id="ai-prompt-status"></div>
      <div class="ai-prompt-actions">
        <button type="button" class="ai-prompt-secondary" id="ai-prompt-cancel">取消</button>
        <button type="button" class="ai-prompt-primary" id="ai-prompt-use" disabled>使用优化版</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  byId('ai-prompt-close').onclick = closeModal;
  byId('ai-prompt-cancel').onclick = closeModal;
  byId('ai-prompt-rerun').onclick = () => runOptimization();
  byId('ai-prompt-use').onclick = applyResult;
  modal.addEventListener('click', event => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });
}

function setStatus(message, type = '') {
  const el = byId('ai-prompt-status');
  if (!el) return;
  el.textContent = message || '';
  el.className = `ai-prompt-status ${type}`.trim();
}

function renderList(id, items, fallback) {
  const el = byId(id);
  if (!el) return;
  const values = Array.isArray(items) && items.length ? items : [fallback];
  el.innerHTML = values.map(item => `<li>${escapeHtml(String(item || ''))}</li>`).join('');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function activeMode() {
  return document.querySelector('#mode-switch button.active')?.dataset.mode || 'multi_frame';
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
  return [...document.querySelectorAll('#reference-video-preview .reference-pool-item')].map(item => {
    const token = item.querySelector('strong')?.textContent?.trim() || '';
    const name = item.querySelector('em')?.textContent?.trim() || '';
    const type = item.querySelector('.reference-video-meta span')?.textContent?.trim() || '';
    return { token, name, type };
  }).filter(item => item.token || item.name);
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

  return images.slice(0, MAX_VISION_IMAGES);
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

  const response = await fetch(src);
  if (!response.ok) throw new Error(`读取本地图片失败：HTTP ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('当前素材不是图片');
  return blobToDataUrl(blob);
}

async function analyzeImagesForPrompt(serial) {
  const candidates = visibleImageCandidates();
  if (!candidates.length) return null;

  const analyses = [];
  for (let index = 0; index < candidates.length; index += 1) {
    if (serial !== requestSerial) return null;
    const candidate = candidates[index];
    setStatus(`千问正在理解图片 ${index + 1}/${candidates.length}：${candidate.label || `图片${index + 1}`}…`);

    try {
      const imageUrl = await imageSourceForVision(candidate.src);
      const { data, error } = await supabase.functions.invoke(VISION_FUNCTION_NAME, {
        body: {
          image_url: imageUrl,
          prompt: '请准确分析这张图片，为 Seedance 视频提示词优化提供主体、场景、构图、镜头、光影、色彩、关键元素、可行动作、保持规则和避免规则。',
        },
      });

      if (error) throw new Error(error.message || '视觉分析服务调用失败');
      if (!data?.ok || !data?.vision_context) throw new Error(data?.error || '千问没有返回有效视觉结果');

      analyses.push({
        index: index + 1,
        label: candidate.label || `图片${index + 1}`,
        model: data.model || 'qwen-vl-plus',
        analysis: data.vision_context,
      });
    } catch (error) {
      analyses.push({
        index: index + 1,
        label: candidate.label || `图片${index + 1}`,
        error: error?.message || String(error),
      });
    }
  }

  const successful = analyses.filter(item => item.analysis);
  if (!successful.length) {
    const reason = analyses.map(item => item.error).filter(Boolean)[0] || '没有可分析的图片';
    throw new Error(`图片视觉理解失败：${reason}`);
  }

  return {
    source: 'qwen-vl-plus',
    image_count: successful.length,
    images: successful,
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
  byId('ai-prompt-use').disabled = true;
  renderList('ai-prompt-changes', [], '正在分析提示词');
  renderList('ai-prompt-warnings', [], '正在检查素材引用和约束');
  setStatus('正在连接 DeepSeek，请稍候…');
  byId('ai-prompt-modal').hidden = false;
  runOptimization();
}

async function runOptimization() {
  if (!activeTextarea) return;
  const prompt = activeTextarea.value.trim();
  if (!prompt) return;
  const serial = ++requestSerial;
  const button = byId('ai-prompt-rerun');
  button.disabled = true;
  byId('ai-prompt-use').disabled = true;
  byId('ai-prompt-optimized').value = '';
  setStatus('正在优化提示词…');
  renderList('ai-prompt-changes', [], '正在生成');
  renderList('ai-prompt-warnings', [], '正在检查');

  try {
    const payload = contextFor(activeTextarea);
    const visionContext = await analyzeImagesForPrompt(serial);
    if (serial !== requestSerial) return;
    if (visionContext) payload.vision_context = visionContext;
    setStatus(visionContext ? '千问视觉理解完成，正在结合图片与原提示词进行优化…' : '未检测到图片，正在按文字上下文优化…');
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: payload });
    if (serial !== requestSerial) return;
    if (error) throw new Error(error.message || '调用优化服务失败');
    if (!data?.ok) throw new Error(data?.error || 'DeepSeek 没有返回有效结果');

    const optimized = String(data.optimized_prompt || '').trim();
    if (!optimized) throw new Error('优化结果为空，请重新优化');
    const missing = missingReferenceTokens(prompt, optimized);
    if (missing.length) throw new Error(`优化结果丢失素材引用：${missing.join('、')}`);

    currentResult = data;
    byId('ai-prompt-optimized').value = optimized;
    renderList('ai-prompt-changes', data.changes, '已整理表达和镜头逻辑');
    renderList('ai-prompt-warnings', data.warnings, '未发现明显冲突');
    byId('ai-prompt-use').disabled = false;
    setStatus(`优化完成 · ${data.model || 'DeepSeek'}${payload.vision_context ? ' + 千问视觉理解' : ''} · 未自动覆盖原文`, 'ok');
  } catch (error) {
    currentResult = null;
    setStatus(error?.message || String(error), 'error');
    renderList('ai-prompt-changes', [], '本次优化未完成');
    renderList('ai-prompt-warnings', [], '请检查 DeepSeek API Key、余额或网络后重试');
  } finally {
    button.disabled = false;
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
  const modal = byId('ai-prompt-modal');
  if (modal) modal.hidden = true;
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
}

function init() {
  injectStyles();
  ensureModal();
  wireButtons();
  document.body.dataset.promptOptimizerBuild = BUILD;
  console.log('[Seedance Prompt Optimizer]', BUILD);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();

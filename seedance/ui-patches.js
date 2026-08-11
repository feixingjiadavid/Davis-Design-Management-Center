const BUILD = '20260811-emergency-recovery-r50';

const $ = id => document.getElementById(id);

function appLooksAlive() {
  const name = String($('sidebar-name')?.textContent || '').trim();
  const role = String($('sidebar-role')?.textContent || '').trim();
  const body = document.body;
  return Boolean(
    body?.dataset?.seedanceReady === 'true' ||
    body?.dataset?.davisVideoReady === 'true' ||
    (name && !/加载中|loading/i.test(name) && role)
  );
}

function setRecoveryStatus(message) {
  let node = document.getElementById('davis-video-emergency-status');
  if (!node) {
    node = document.createElement('div');
    node.id = 'davis-video-emergency-status';
    Object.assign(node.style, {
      position: 'fixed', left: '50%', bottom: '18px', transform: 'translateX(-50%)',
      zIndex: '99999', padding: '10px 14px', borderRadius: '10px',
      background: 'rgba(24,32,56,.92)', color: '#fff', fontSize: '12px',
      boxShadow: '0 8px 28px rgba(0,0,0,.18)', pointerEvents: 'none'
    });
    document.body.appendChild(node);
  }
  node.textContent = message;
}

async function emergencyRecover() {
  if (globalThis.__davisVideoEmergencyRecovering || appLooksAlive()) return;
  globalThis.__davisVideoEmergencyRecovering = true;
  setRecoveryStatus('Davis Video 正在恢复页面运行时…');

  try {
    await import('./app.js?v=20260811-emergency-r50-loader');
  } catch (error) {
    console.error('[Davis Video Emergency] R50 loader retry failed', error);
  }

  await new Promise(resolve => setTimeout(resolve, 1800));
  if (appLooksAlive()) {
    setRecoveryStatus('Davis Video 已恢复');
    setTimeout(() => document.getElementById('davis-video-emergency-status')?.remove(), 1800);
    return;
  }

  try {
    console.warn('[Davis Video Emergency] loader still not alive; starting stable base runtime directly');
    await import('./app-v46.js?v=20260811-emergency-direct-runtime');
  } catch (error) {
    console.error('[Davis Video Emergency] direct runtime failed', error);
    setRecoveryStatus('页面运行时恢复失败，请重新打开本页');
    return;
  }

  await new Promise(resolve => setTimeout(resolve, 1200));
  if (appLooksAlive()) {
    setRecoveryStatus('Davis Video 已恢复');
    setTimeout(() => document.getElementById('davis-video-emergency-status')?.remove(), 1800);
  } else {
    setRecoveryStatus('页面运行时仍未启动，已记录恢复失败');
  }
}

function init() {
  document.body.dataset.davisVideoUiBuild = BUILD;
  console.log('[Davis Video Emergency Recovery]', BUILD);
  setTimeout(() => void emergencyRecover(), 1800);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
else init();

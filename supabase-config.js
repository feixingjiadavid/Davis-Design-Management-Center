// supabase-config.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const supabaseUrl = 'https://supffjeeouibhqdfqosk.supabase.co'
const supabaseAnonKey = 'sb_publishable_v6fbIaU52lLFacywiIKvUw_x1gc1ckQ'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

const isVideoStudio = typeof window !== 'undefined' && /(?:^|\/)ai-assistant\.html$/i.test(window.location.pathname)

if (isVideoStudio) {
  try {
    const { prepareHistoryArchiveA } = await import('./seedance/a-history-compat.js')
    const history = await prepareHistoryArchiveA(supabase)
    if (history?.error) {
      console.warn('[Davis Video A] history preservation skipped; A UI continues', history.error)
    } else if (history?.reload) {
      console.log('[Davis Video A] archived historical generated projects; reloading once', history)
      location.reload()
    }
  } catch (error) {
    console.warn('[Davis Video A] history compatibility bootstrap failed; A UI continues', error)
  }
}

async function waitForR50ProjectTree(timeoutMs = 10000) {
  if (typeof document === 'undefined') return false
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const projectList = document.getElementById('project-list')
    const sidebarName = String(document.getElementById('sidebar-name')?.textContent || '').trim()
    const userReady = sidebarName && !/加载中|loading/i.test(sidebarName)
    const treeReady = Boolean(
      projectList &&
      (projectList.querySelector('.project-tree-group, .project-child') || projectList.children.length === 0)
    )

    if (userReady && treeReady) {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return true
    }

    await new Promise(resolve => setTimeout(resolve, 80))
  }

  console.warn('[Davis Video A] R50 project tree readiness timed out; mounting A layer once as fallback')
  return false
}

async function bootAVersionAfterR50() {
  await waitForR50ProjectTree()

  await import('./seedance/r54-paid-safety.js')
    .then(({ initPaidSafetyR54 }) => initPaidSafetyR54())
    .then(() => import('./seedance/r54-deliverables.js?v=20260812-r12-task-state-1'))
    .then(({ initDeliverablesR54 }) => initDeliverablesR54())
    .then(() => import('./seedance/r54-tree-stability.js'))
    .then(({ initTreeStabilityR54 }) => initTreeStabilityR54())
    .then(() => import('./seedance/r54-architecture-ux.js'))
    .then(({ initArchitectureUxR54 }) => initArchitectureUxR54())
    .then(() => import('./seedance/r54-selection-tools.js'))
    .then(({ initSelectionToolsR54 }) => initSelectionToolsR54())
    .then(() => import('./seedance/r54-cost-context.js'))
    .then(({ initCostContextR54 }) => initCostContextR54())
}

if (isVideoStudio) {
  setTimeout(() => {
    void bootAVersionAfterR50().catch(error => console.error('[Davis Video A] extension init failed', error))
  }, 0)
}

console.log('🚀 Supabase 云端服务器配置完成！')

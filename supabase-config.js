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
    if (history?.reload) {
      console.log('[Davis Video A] archived historical generated projects; reloading once', history)
      location.reload()
    }
  } catch (error) {
    console.warn('[Davis Video A] history compatibility bootstrap skipped', error)
  }

  queueMicrotask(() => {
    import('./seedance/r54-paid-safety.js')
      .then(({ initPaidSafetyR54 }) => initPaidSafetyR54())
      .then(() => import('./seedance/r54-deliverables.js'))
      .then(({ initDeliverablesR54 }) => initDeliverablesR54())
      .then(() => import('./seedance/r54-tree-stability.js'))
      .then(({ initTreeStabilityR54 }) => initTreeStabilityR54())
      .then(() => import('./seedance/r54-architecture-ux.js'))
      .then(({ initArchitectureUxR54 }) => initArchitectureUxR54())
      .then(() => import('./seedance/r54-selection-tools.js'))
      .then(({ initSelectionToolsR54 }) => initSelectionToolsR54())
      .then(() => import('./seedance/r54-cost-context.js'))
      .then(({ initCostContextR54 }) => initCostContextR54())
      .catch(error => console.error('[Davis Video A] extension init failed', error))
  })
}

console.log('🚀 Supabase 云端服务器配置完成！')

// supabase-config.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// 你的专属云端服务器地址
const supabaseUrl = 'https://supffjeeouibhqdfqosk.supabase.co'
// 你的公开匿名密钥
const supabaseAnonKey = 'sb_publishable_v6fbIaU52lLFacywiIKvUw_x1gc1ckQ'

// 创建连接通道并暴露给其他页面使用
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// R54 只在 Davis Video Studio 页面加载。
// 顺序：费用安全保护 -> 成片单元主工作流 -> 批量选择/审核辅助。
// 都以扩展模块方式接入，不改 app-v46.js 基础运行时。
if (typeof window !== 'undefined' && /(?:^|\/)ai-assistant\.html$/i.test(window.location.pathname)) {
  queueMicrotask(() => {
    import('./seedance/r54-paid-safety.js')
      .then(({ initPaidSafetyR54 }) => initPaidSafetyR54())
      .then(() => import('./seedance/r54-deliverables.js'))
      .then(({ initDeliverablesR54 }) => initDeliverablesR54())
      .then(() => import('./seedance/r54-selection-tools.js'))
      .then(({ initSelectionToolsR54 }) => initSelectionToolsR54())
      .catch(error => console.error('[Davis Video R54] extension init failed', error));
  });
}

console.log("🚀 Supabase 云端服务器配置完成！");
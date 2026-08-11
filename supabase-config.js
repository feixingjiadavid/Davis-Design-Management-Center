// supabase-config.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// 你的专属云端服务器地址
const supabaseUrl = 'https://supffjeeouibhqdfqosk.supabase.co'
// 你的公开匿名密钥
const supabaseAnonKey = 'sb_publishable_v6fbIaU52lLFacywiIKvUw_x1gc1ckQ'

// 创建连接通道并暴露给其他页面使用
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// R54 只在 Davis Video Studio 页面加载。
// 先注册费用安全保护，再注册成片单元/批量工作流；两者都不改 app-v46.js 基础运行时。
if (typeof window !== 'undefined' && /(?:^|\/)ai-assistant\.html$/i.test(window.location.pathname)) {
  queueMicrotask(() => {
    import('./seedance/r54-paid-safety.js')
      .then(({ initPaidSafetyR54 }) => initPaidSafetyR54())
      .then(() => import('./seedance/r54-deliverables.js'))
      .then(({ initDeliverablesR54 }) => initDeliverablesR54())
      .catch(error => console.error('[Davis Video R54] extension init failed', error));
  });
}

console.log("🚀 Supabase 云端服务器配置完成！");
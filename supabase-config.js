// supabase-config.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// 你的专属云端服务器地址
const supabaseUrl = 'https://supffjeeouibhqdfqosk.supabase.co'
// 你的公开匿名密钥
const supabaseAnonKey = 'sb_publishable_v6fbIaU52lLFacywiIKvUw_x1gc1ckQ'

// 创建连接通道并暴露给其他页面使用
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

console.log("🚀 Supabase 云端服务器配置完成！");
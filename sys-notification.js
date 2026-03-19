/**
 * Davis Design Management Center - 系统通知增强版
 * 修复了加载顺序冲突和用户信息丢失的问题
 */
const SysNotification = {
    currentUser: null,
    async init() {
        // 1. 确保 supabase 已就绪
        if (!window.supabase) {
            console.warn("⏳ 等待 Supabase 初始化...");
            setTimeout(() => this.init(), 500);
            return;
        }

        try {
            const { data: { user } } = await window.supabase.auth.getUser();
            if (!user) {
                console.log("ℹ️ 用户未登录，通知系统静默");
                return;
            }
            this.currentUser = user;
            this.injectStyles();     
            this.startListening();   
            this.applyPermissions(); 
            console.log("✅ 系统插件就绪:", user.email);
        } catch (err) {
            console.error("❌ 初始化失败:", err);
        }
    },

    startListening() {
        window.supabase.channel('global-notif')
            .on('postgres_changes', { 
                event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${this.currentUser.id}` 
            }, payload => this.showPopup(payload.new))
            .subscribe();
    },

    applyPermissions() {
        if (this.currentUser.email && this.currentUser.email.includes('davidxxu')) {
            setTimeout(() => {
                const btns = document.querySelectorAll('.btn-approve, #approve-btn, [data-action="audit"]');
                btns.forEach(btn => {
                    btn.disabled = true;
                    btn.style.opacity = '0.3';
                    btn.style.cursor = 'not-allowed';
                    btn.title = "管理员 davidxxu 不拥有审核权限";
                });
            }, 1500); 
        }
    },

    async sendNotice({ targetId, targetEmail, content, category, url }) {
        if (!this.currentUser) {
            const { data: { user } } = await window.supabase.auth.getUser();
            this.currentUser = user;
        }
        
        const sender = this.currentUser ? this.currentUser.email.split('@')[0] : '系统用户';

        await window.supabase.from('notifications').insert([{
            user_id: targetId,
            target_email: targetEmail, 
            sender_name: sender, 
            content: content,
            category: category || 'info', 
            link_url: url
        }]);
    },

    showPopup(data) {
        const container = document.getElementById('sys-toast-container') || this.injectStyles();
        const toast = document.createElement('div');
        toast.className = 'sys-toast-node';
        if (data.category === 'urge') toast.style.borderLeftColor = "#ff4d4f";
        toast.innerHTML = `<strong>🔔 系统提醒</strong><div style="font-size:13px; color:#666;">${data.content}</div>`;
        toast.onclick = () => { if (data.link_url) window.location.href = data.link_url; };
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 8000);
    },

    injectStyles() {
        if (document.getElementById('sys-toast-container')) return document.getElementById('sys-toast-container');
        const style = document.createElement('style');
        style.innerHTML = `
            #sys-toast-container { position: fixed; top: 20px; right: 20px; z-index: 99999; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
            .sys-toast-node { background: white; border-left: 6px solid #4f46e5; padding: 15px; border-radius: 8px; width: 280px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); cursor: pointer; animation: slideIn 0.4s ease; pointer-events: auto; }
            @keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        `;
        document.head.appendChild(style);
        const container = document.createElement('div');
        container.id = 'sys-toast-container';
        document.body.appendChild(container);
        return container;
    }
};

// 只有在非模块环境下才自动启动，模块环境下由 Index.html 启动
if (typeof window !== 'undefined') {
    window.SysNotification = SysNotification;
}

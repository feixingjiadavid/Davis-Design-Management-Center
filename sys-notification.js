/**
 * Davis Design Management Center - 系统核心通知插件
 * 功能：1. 实时弹窗 2. 邮件触发逻辑 3. davidxxu 权限限制
 */
const SysNotification = {
    currentUser: null,
    async init() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        this.currentUser = user;
        this.injectStyles();     
        this.startListening();   
        this.applyPermissions(); 
        console.log("🚀 系统插件已就绪:", user.email);
    },
    // 实时监听：有人发消息给你，页面立即弹窗
    startListening() {
        supabase.channel('global-notif')
            .on('postgres_changes', { 
                event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${this.currentUser.id}` 
            }, payload => this.showPopup(payload.new))
            .subscribe();
    },
    // 权限逻辑：管理员 davidxxu 无法审核
    applyPermissions() {
        if (this.currentUser.email.includes('davidxxu')) {
            setTimeout(() => {
                const btns = document.querySelectorAll('.btn-approve, #approve-btn, [data-action="audit"]');
                btns.forEach(btn => {
                    btn.disabled = true;
                    btn.style.opacity = '0.3';
                    btn.style.cursor = 'not-allowed';
                    btn.title = "管理员 davidxxu 不拥有审核框架稿件权限";
                });
            }, 1000); 
        }
    },
    // 统一发送函数
    async sendNotice({ targetId, targetEmail, content, category, url }) {
        await supabase.from('notifications').insert([{
            user_id: targetId,
            target_email: targetEmail, 
            sender_name: this.currentUser.email.split('@')[0], 
            content: content,
            category: category, 
            link_url: url
        }]);
    },
    showPopup(data) {
        const container = document.getElementById('sys-toast-container');
        const toast = document.createElement('div');
        toast.className = 'sys-toast-node';
        if (data.category === 'urge') toast.style.borderLeftColor = "#ff4d4f";
        toast.innerHTML = `<strong>🔔 系统提醒</strong><div style="font-size:13px; color:#666;">${data.content}</div>`;
        toast.onclick = () => { if (data.link_url) window.location.href = data.link_url; };
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 8000);
    },
    injectStyles() {
        const style = document.createElement('style');
        style.innerHTML = `
            #sys-toast-container { position: fixed; top: 20px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; }
            .sys-toast-node { background: white; border-left: 6px solid #4f46e5; padding: 15px; border-radius: 8px; width: 280px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); cursor: pointer; animation: slideIn 0.4s ease; transition: 0.3s; }
            @keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        `;
        document.head.appendChild(style);
        const container = document.createElement('div');
        container.id = 'sys-toast-container';
        document.body.appendChild(container);
    }
};
SysNotification.init();
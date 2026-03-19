/**
 * 核心：设计需求管理系统 - 实时通知插件 (增强版)
 */
const SysNotification = {
    currentUser: null,

    // 1. 初始化监听
    async init() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        this.currentUser = user;

        console.log("实时通知系统已启动，正在监听:", user.email);

        // 订阅通知
        supabase
            .channel('global-notifications')
            .on(
                'postgres_changes', 
                { 
                    event: 'INSERT', 
                    schema: 'public', 
                    table: 'notifications', 
                    filter: `user_id=eq.${user.id}` 
                }, 
                (payload) => {
                    this.showPopup(payload.new);
                }
            )
            .subscribe();

        this.injectStyles();
        this.applyRolePermissions(); // 初始化权限控制
    },

    // 2. 增强型发送函数 (供业务页面调用)
    // category 分类：'urge'-催办, 'new'-下发需求, 'submit'-提交方案
    async sendNotification({ targetUserId, targetEmail, content, category, link = "" }) {
        const { error } = await supabase.from('notifications').insert([
            {
                user_id: targetUserId,
                receiver_email: targetEmail, // 存入邮箱，用于触发后端邮件 Webhook
                sender_name: this.currentUser.email.split('@')[0], // 获取当前发送人
                content: content,
                category: category,
                link_url: link,
                is_read: false
            }
        ]);
        if (error) {
            console.error("通知发送失败:", error);
        } else {
            console.log(`${category} 通知已同步至云端`);
        }
    },

    // 3. 权限过滤逻辑 (处理 davidxxu 和 judyzzhang)
    async applyRolePermissions() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 特殊逻辑：davidxxu 是管理员但不能审核
        if (user.email.includes('davidxxu')) {
            const reviewButtons = document.querySelectorAll('.review-btn, #btn-approve');
            reviewButtons.forEach(btn => {
                btn.disabled = true;
                btn.style.display = 'none'; // 或者设置为灰色不可点击
                console.warn("当前用户(davidxxu)无权审核框架稿件");
            });
        }
        
        // judyzzhang 逻辑通常由后端 RLS 或前端显式放开按钮即可
    },

    // 4. 弹窗 UI 逻辑 (保留并增强样式)
    showPopup(data) {
        const toast = document.createElement('div');
        toast.className = 'sys-toast-node';
        
        // 根据类型显示不同的颜色或图标
        const colorMap = { 'urge': '#ef4444', 'new': '#10b981', 'submit': '#3b82f6' };
        const borderColor = colorMap[data.category] || '#4f46e5';

        toast.style.borderLeftColor = borderColor;
        toast.innerHTML = `
            <div style="font-weight:bold; color:#1a1a1a; margin-bottom:4px;">
                ${data.category === 'urge' ? '⚠️ 紧急催办' : '🔔 任务动态'}
            </div>
            <div style="font-size:13px; color:#666;">
                <strong>${data.sender_name}</strong>: ${data.content}
            </div>
            <div style="font-size:11px; color:#999; margin-top:8px;">点击跳转处理</div>
        `;
        
        toast.onclick = () => {
            if (data.link_url) window.location.href = data.link_url;
            toast.remove();
        };

        document.getElementById('sys-toast-container').appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 500);
        }, 8000); // 延长到8秒，确保用户看到
    },

    injectStyles() {
        if (document.getElementById('sys-notification-style')) return;
        const style = document.createElement('style');
        style.id = 'sys-notification-style';
        style.innerHTML = `
            #sys-toast-container {
                position: fixed; top: 20px; right: 20px; z-index: 99999;
                display: flex; flex-direction: column; gap: 12px;
            }
            .sys-toast-node {
                background: #ffffff; border-left: 6px solid #4f46e5;
                padding: 16px; border-radius: 8px; width: 300px;
                box-shadow: 0 15px 35px rgba(0,0,0,0.15);
                cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                animation: sysSlideIn 0.5s ease-out;
            }
            @keyframes sysSlideIn {
                from { opacity: 0; transform: translateX(120%); }
                to { opacity: 1; transform: translateX(0); }
            }
        `;
        document.head.appendChild(style);
        
        const container = document.createElement('div');
        container.id = 'sys-toast-container';
        document.body.appendChild(container);
    }
};

SysNotification.init();

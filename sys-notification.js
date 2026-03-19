/**
 * 核心：设计需求管理系统 - 实时通知插件
 * 功能：监听 Supabase 变更、过滤角色权限、显示置顶弹窗
 */

const SysNotification = {
    // 1. 初始化监听
    async init() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        console.log("实时通知系统已启动，正在监听用户:", user.email);

        // 订阅 notifications 表的插入事件
        supabase
            .channel('global-notifications')
            .on(
                'postgres_changes', 
                { 
                    event: 'INSERT', 
                    schema: 'public', 
                    table: 'notifications', 
                    filter: `user_id=eq.${user.id}` // 只接收发给自己的
                }, 
                (payload) => {
                    this.showPopup(payload.new);
                }
            )
            .subscribe();

        // 顺便初始化 CSS 样式
        this.injectStyles();
    },

    // 2. 发送通知的通用函数（在业务逻辑中调用）
    async send(targetUserId, content, link = "") {
        const { error } = await supabase.from('notifications').insert([
            {
                user_id: targetUserId,
                content: content,
                link_url: link,
                is_read: false
            }
        ]);
        if (error) console.error("通知发送失败:", error);
    },

    // 3. 弹窗 UI 逻辑
    showPopup(data) {
        const toast = document.createElement('div');
        toast.className = 'sys-toast-node';
        toast.innerHTML = `
            <div style="font-weight:bold; color:#1a1a1a; margin-bottom:4px;">🔔 新任务动态</div>
            <div style="font-size:13px; color:#666;">${data.content}</div>
            <div style="font-size:11px; color:#999; margin-top:8px;">点击查看详情</div>
        `;
        
        toast.onclick = () => {
            if (data.link_url) window.location.href = data.link_url;
            toast.remove();
        };

        document.getElementById('sys-toast-container').appendChild(toast);
        
        // 6秒后自动移除
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 500);
        }, 6000);
    },

    // 4. 注入样式（确保不影响原有页面布局）
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
                background: #ffffff; border-left: 5px solid #4f46e5;
                padding: 16px; border-radius: 8px; width: 280px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                cursor: pointer; transition: all 0.3s ease;
                animation: slideIn 0.4s ease-out;
            }
            .sys-toast-node:hover { transform: scale(1.02); background: #f9f9ff; }
            @keyframes slideIn {
                from { opacity: 0; transform: translateX(100px); }
                to { opacity: 1; transform: translateX(0); }
            }
        `;
        document.head.appendChild(style);
        
        const container = document.createElement('div');
        container.id = 'sys-toast-container';
        document.body.appendChild(container);
    }
};

// 自动启动
SysNotification.init();
/**
 * 核心：设计需求管理系统 - 实时通知与权限控制插件
 * 功能：监听 Supabase、显示弹窗、权限过滤、触发邮件通知逻辑
 */

const SysNotification = {
    currentUser: null,

    // 1. 初始化
    async init() {
        // 获取当前登录用户信息
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        this.currentUser = user;

        console.log("🚀 通知系统已就绪，当前用户:", user.email);

        // 注入样式和容器
        this.injectStyles();

        // 启动实时监听：只接收发给自己的消息
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

        // 处理特殊用户的权限逻辑
        this.handleSpecialPermissions();
    },

    /**
     * 2. 发送通知 (核心函数)
     * @param {string} targetUserId - 接收者的 UUID
     * @param {string} targetEmail - 接收者的邮箱 (用于不在线时发邮件)
     * @param {string} content - 消息正文
     * @param {string} link - 点击弹窗要跳转的 URL (如 'task-detail-designer.html?id=123')
     */
    async send(targetUserId, targetEmail, content, link = "") {
        const { error } = await supabase.from('notifications').insert([
            {
                user_id: targetUserId,
                target_email: targetEmail, 
                sender_name: this.currentUser.email.split('@')[0], // 提取邮箱前缀作为发送人名
                content: content,
                link_url: link,
                status: 'unread'
            }
        ]);
        
        if (error) {
            console.error("通知发送失败:", error);
        } else {
            console.log("通知已发出，关联方将收到实时弹窗及邮件提醒");
        }
    },

    // 3. 权限控制：处理 davidxxu 和 judyzzhang
    handleSpecialPermissions() {
        const userEmail = this.currentUser.email;

        // 特殊逻辑：davidxxu (管理员) 无法审核
        if (userEmail.includes('davidxxu')) {
            console.warn("系统检测到管理员 davidxxu，已锁定审核权限。");
            // 定时器确保页面元素加载完毕后执行锁定
            setTimeout(() => {
                // 找到所有的审核/批准按钮（根据你 HTML 里的 class 或 ID 调整）
                const reviewButtons = document.querySelectorAll('.btn-approve, #approve-task, [data-action="review"]');
                reviewButtons.forEach(btn => {
                    btn.disabled = true;
                    btn.style.opacity = '0.5';
                    btn.style.cursor = 'not-allowed';
                    btn.title = "管理员 davidxxu 不拥有审核框架稿件权限";
                    // 甚至可以直接隐藏
                    // btn.style.display = 'none';
                });
            }, 800);
        }

        // judyzzhang 默认拥有全部权限，无需特殊拦截
    },

    // 4. 弹窗 UI 逻辑
    showPopup(data) {
        const container = document.getElementById('sys-toast-container');
        const toast = document.createElement('div');
        toast.className = 'sys-toast-node';
        
        // 识别是否是催办信息，改变边框颜色
        if (data.content.includes("催办")) {
            toast.style.borderLeft = "5px solid #ff4d4f";
        }

        toast.innerHTML = `
            <div style="font-weight:bold; color:#1a1a1a; margin-bottom:4px; display:flex; justify-content:space-between;">
                <span>🔔 系统通知</span>
                <span style="font-size:10px; color:#aaa;">${new Date().toLocaleTimeString()}</span>
            </div>
            <div style="font-size:13px; color:#444; line-height:1.5;">
                <strong>${data.sender_name || '系统'}</strong>: ${data.content}
            </div>
            <div style="font-size:11px; color:#1890ff; margin-top:8px; text-align:right;">点击处理详情 →</div>
        `;
        
        toast.onclick = () => {
            if (data.link_url) window.location.href = data.link_url;
            toast.remove();
        };

        container.appendChild(toast);
        
        // 8秒后自动移除
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 500);
        }, 8000);
    },

    injectStyles() {
        if (document.getElementById('sys-notification-style')) return;
        const style = document.createElement('style');
        style.id = 'sys-notification-style';
        style.innerHTML = `
            #sys-toast-container {
                position: fixed; top: 20px; right: 20px; z-index: 10000;
                display: flex; flex-direction: column-reverse; gap: 12px;
            }
            .sys-toast-node {
                background: #ffffff; border-left: 5px solid #4f46e5;
                padding: 16px; border-radius: 8px; width: 300px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.15);
                cursor: pointer; transition: all 0.3s ease;
                animation: sysSlideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            .sys-toast-node:hover { transform: translateY(-3px); box-shadow: 0 15px 35px rgba(0,0,0,0.2); }
            @keyframes sysSlideIn {
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

// 启动
SysNotification.init();

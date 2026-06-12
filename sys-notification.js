/**
 * Davis Design Management Center - 系统通知增强版
 * 修复了加载顺序冲突和用户信息丢失的问题
 * 新增：完整的小铃铛（站内信）数据流转机制
 */
const SysNotification = {
    currentUser: null,

    getActiveProfile() {
        try { return JSON.parse(localStorage.getItem('activeUserObj') || '{}'); }
        catch (e) { return {}; }
    },

    getIdentityEmails() {
        const set = new Set();
        const profile = this.getActiveProfile();
        if (this.currentUser && this.currentUser.email) set.add(String(this.currentUser.email).toLowerCase());
        if (profile.email) set.add(String(profile.email).toLowerCase());
        const en = String(profile.enName || profile.en_name || '').trim().toLowerCase();
        if (en) set.add(`${en}@webank.com`);
        return Array.from(set).filter(Boolean);
    },

    escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    safeInternalUrl(url) {
        try {
            if (!url) return '';
            const u = new URL(String(url), window.location.origin);
            const allowedHost = window.location.hostname;
            if (u.hostname !== allowedHost && u.hostname !== 'davis-design.cn') return '';
            return u.href;
        } catch (e) {
            return '';
        }
    },

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
            
            // 【新增】初始化时自动拉取未读消息数并更新页面铃铛
            this.updateBellCount();

            console.log("✅ 系统插件就绪:", user.email);
        } catch (err) {
            console.error("❌ 初始化失败:", err);
        }
    },

    startListening() {
        // 1) 原链路：按 auth user_id 实时收
        window.supabase.channel('global-notif-user')
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${this.currentUser.id}`
            }, payload => {
                this.showPopup(payload.new);
                this.updateBellCount();
            })
            .subscribe();

        // 2) 新增兜底链路：按 target_email 实时收
        // 解决 users 表没有 enName / 无法匹配 user_id 时，小铃铛收不到的问题。
        const emails = this.getIdentityEmails();
        emails.forEach((email, idx) => {
            window.supabase.channel(`global-notif-email-${idx}`)
                .on('postgres_changes', {
                    event: 'INSERT', schema: 'public', table: 'notifications', filter: `target_email=eq.${email}`
                }, payload => {
                    // 如果同一条既命中 user_id 又命中 email，可能会重复弹，这里用 id 简单去重
                    window.__seenNotifIds = window.__seenNotifIds || new Set();
                    if (payload.new && window.__seenNotifIds.has(payload.new.id)) return;
                    if (payload.new) window.__seenNotifIds.add(payload.new.id);
                    this.showPopup(payload.new);
                    this.updateBellCount();
                })
                .subscribe();
        });
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
            content: this.escapeHtml(content),
            category: category || 'info', 
            link_url: this.safeInternalUrl(url),
            is_read: false // 【新增】确保新建的通知默认是未读状态
        }]);
    },

    showPopup(data) {
        const container = document.getElementById('sys-toast-container') || this.injectStyles();
        const toast = document.createElement('div');
        toast.className = 'sys-toast-node';
        if (data.category === 'urge') toast.style.borderLeftColor = "#ff4d4f";
        const safeContent = this.escapeHtml(data.content);
        const safeUrl = this.safeInternalUrl(data.link_url);
        toast.innerHTML = `<strong>🔔 系统提醒</strong><div style="font-size:13px; color:#666;">${safeContent}</div>`;
        toast.onclick = () => { if (safeUrl) window.location.href = safeUrl; };
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
    },

    // ================= 【以下为打通铃铛新增的核心方法】 =================

    // 1. 获取未读消息数量
    async getUnreadCount() {
        if (!this.currentUser) return 0;

        let total = 0;
        const seen = new Set();

        // 按 user_id 取
        const { data: userRows, error: userErr } = await window.supabase
            .from('notifications')
            .select('id')
            .eq('user_id', this.currentUser.id)
            .eq('is_read', false);

        if (!userErr && Array.isArray(userRows)) {
            userRows.forEach(r => { if (!seen.has(r.id)) { seen.add(r.id); total++; } });
        }

        // 按 target_email 兜底取
        const emails = this.getIdentityEmails();
        for (const email of emails) {
            const { data: emailRows, error: emailErr } = await window.supabase
                .from('notifications')
                .select('id')
                .eq('target_email', email)
                .eq('is_read', false);

            if (!emailErr && Array.isArray(emailRows)) {
                emailRows.forEach(r => { if (!seen.has(r.id)) { seen.add(r.id); total++; } });
            }
        }

        return total;
    },

    // 2. 更新页面上的铃铛UI红点/数字
    async updateBellCount() {
        const count = await this.getUnreadCount();
        // 自动寻找页面中 class 为 bell-badge 或 id 为 notification-badge 的元素
        const badges = document.querySelectorAll('.bell-badge, #notification-badge');
        badges.forEach(badge => {
            if (count > 0) {
                badge.style.display = 'inline-block';
                badge.textContent = count > 99 ? '99+' : count;
            } else {
                badge.style.display = 'none';
                badge.textContent = '0';
            }
        });
    },

    // 3. 获取当前用户的通知列表数据（用于点击铃铛后渲染列表）
    async getNotifications(limit = 20) {
        if (!this.currentUser) return [];
        const rows = [];
        const seen = new Set();

        const append = (arr) => {
            if (!Array.isArray(arr)) return;
            arr.forEach(item => {
                if (item && !seen.has(item.id)) {
                    seen.add(item.id);
                    rows.push(item);
                }
            });
        };

        const { data: byUser, error: errUser } = await window.supabase
            .from('notifications')
            .select('*')
            .eq('user_id', this.currentUser.id)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (!errUser) append(byUser);

        for (const email of this.getIdentityEmails()) {
            const { data: byEmail, error: errEmail } = await window.supabase
                .from('notifications')
                .select('*')
                .eq('target_email', email)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (!errEmail) append(byEmail);
        }

        return rows
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
            .slice(0, limit);
    },

    // 4. 将单条消息标记为已读
    async markAsRead(notificationId) {
        const { error } = await window.supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId);

        if (!error) {
            this.updateBellCount(); // 标记已读后自动刷新铃铛数字
        } else {
            console.error("标记已读失败:", error);
        }
    },

    // 5. 将当前用户的所有消息标记为已读
    async markAllAsRead() {
        if (!this.currentUser) return;

        await window.supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', this.currentUser.id)
            .eq('is_read', false);

        for (const email of this.getIdentityEmails()) {
            await window.supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('target_email', email)
                .eq('is_read', false);
        }

        this.updateBellCount();
    }
};

// 只有在非模块环境下才自动启动，模块环境下由 Index.html 或其他页面启动
if (typeof window !== 'undefined') {
    window.SysNotification = SysNotification;
}

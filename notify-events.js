// notify-events.js
// 安全版：站外通知事件中转层
// 目标：前端只能写入“系统允许的通知事件”，不能携带外部钓鱼链接/外部邮箱/超长自由文案。
// 注意：真正发邮件仍由 Edge Function 处理，Edge Function 必须二次校验，不信任前端数据。

(function () {
  const ALLOWED_EVENT_TYPES = new Set([
    "urgent",
    "pending_accept",
    "pending_approval",
    "reviewing",
    "rejected",
    "completed",
    "processing",
    "daily_stuck_summary",
  ]);

  const SITE_ORIGIN = "https://davis-design.cn";
  const WEBANK_EMAIL_RE = /^[A-Z0-9._%+-]+@webank\.com$/i;
  const EN_NAME_RE = /^[a-zA-Z][a-zA-Z0-9._-]{0,79}$/;

  function cleanText(value, maxLen = 3000) {
    return String(value || "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLen);
  }

  function safeEnName(value) {
    const v = cleanText(value, 80).toLowerCase();
    return EN_NAME_RE.test(v) ? v : null;
  }

  function safeWebankEmail(email, enName) {
    let e = cleanText(email, 120).toLowerCase();
    if (!e && enName) e = `${enName}@webank.com`;
    return WEBANK_EMAIL_RE.test(e) ? e : null;
  }

  function safeActionUrl(actionUrl, taskId) {
    const fallbackTaskId = encodeURIComponent(cleanText(taskId, 80));
    const fallback = `${SITE_ORIGIN}/task-detail-requester.html?id=${fallbackTaskId}`;

    try {
      if (!actionUrl) return fallback;
      const u = new URL(String(actionUrl), SITE_ORIGIN);
      if (u.origin !== SITE_ORIGIN) return fallback;

      const allowedPages = [
        "/index.html",
        "/task-detail-requester.html",
        "/task-detail-designer.html",
        "/assistant-workspace.html",
        "/manager-workspace.html",
        "/manager-dashboard.html",
        "/message-center.html",
        "/record-list.html",
      ];

      if (!allowedPages.includes(u.pathname)) return fallback;
      return u.toString();
    } catch (e) {
      return fallback;
    }
  }

  window.createNotifyEvent = async function ({
    taskId,
    eventType,
    targetEnName,
    targetDisplayName,
    targetEmail,
    mobile,
    title,
    content,
    actionUrl,
  }) {
    try {
      if (!window.supabase) {
        console.warn("Supabase 未初始化，无法创建通知事件");
        return { ok: false, error: "Supabase 未初始化" };
      }

      const cleanTaskId = cleanText(taskId, 80);
      const cleanEventType = cleanText(eventType || "urgent", 40);
      if (!ALLOWED_EVENT_TYPES.has(cleanEventType)) {
        console.warn("非法通知类型，已拦截：", cleanEventType);
        return { ok: false, error: "非法通知类型" };
      }

      const enName = safeEnName(targetEnName);
      const email = safeWebankEmail(targetEmail, enName);
      if (!email) {
        console.warn("非法通知邮箱，已拦截：", targetEmail, targetEnName);
        return { ok: false, error: "通知邮箱必须是 @webank.com" };
      }

      const cleanTitle = cleanText(title, 100);
      const cleanContent = cleanText(content, 3000);
      if (!cleanTitle || !cleanContent) {
        console.warn("通知标题或内容为空，跳过创建通知事件");
        return { ok: false, error: "通知标题或内容为空" };
      }

      const payload = {
        task_id: cleanTaskId || null,
        event_type: cleanEventType,

        target_en_name: enName,
        target_display_name: cleanText(targetDisplayName || targetEnName || email.split("@")[0], 80),
        target_email: email,
        mobile: cleanText(mobile, 30) || null,

        title: cleanTitle,
        content: cleanContent,
        action_url: safeActionUrl(actionUrl, cleanTaskId),

        email_status: "pending",
        bot_status: "pending",
      };

      const { error } = await window.supabase.from("notification_events").insert([payload]);
      if (error) throw error;

      console.log("✅ notification_events 已写入:", payload.title);
      return { ok: true };
    } catch (err) {
      console.error("❌ notification_events 写入失败:", err);
      return { ok: false, error: err.message || String(err) };
    }
  };
})();

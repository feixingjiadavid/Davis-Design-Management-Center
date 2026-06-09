// notify-events.js
// 安全版：站外通知事件中转层
// 目标：前端只能写入“系统允许的通知事件”，不能携带外部钓鱼链接/外部邮箱/超长自由文案。
// 修复点：
// 1. 支持 targetDisplayName / 中文名 / 昵称 从 user_profiles 解析邮箱。
// 2. 兼容 display_name = 33 -> en_name = debbiehuang -> debbiehuang@webank.com。
// 3. 仍然只允许 @webank.com 内部邮箱。
// 4. 真正发邮件仍由 Bot 巡检 notification_events 后使用内部邮箱能力发送。

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

  async function resolveTargetFromProfiles({ targetEnName, targetDisplayName, targetEmail }) {
    const rawEnName = cleanText(targetEnName, 80);
    const rawDisplayName = cleanText(targetDisplayName, 80);
    const rawEmail = cleanText(targetEmail, 120).toLowerCase();

    // 1. 已传合法内部邮箱，直接使用。
    if (WEBANK_EMAIL_RE.test(rawEmail)) {
      const en = rawEmail.split("@")[0];
      return {
        enName: safeEnName(rawEnName) || en,
        email: rawEmail,
        displayName: rawDisplayName || rawEnName || en,
      };
    }

    // 2. 已传合法英文名，直接拼内部邮箱。
    const directEnName = safeEnName(rawEnName);
    if (directEnName) {
      return {
        enName: directEnName,
        email: `${directEnName}@webank.com`,
        displayName: rawDisplayName || rawEnName,
      };
    }

    // 3. targetDisplayName 如果本身是英文名，也直接拼内部邮箱。
    const displayAsEnName = safeEnName(rawDisplayName);
    if (displayAsEnName) {
      return {
        enName: displayAsEnName,
        email: `${displayAsEnName}@webank.com`,
        displayName: rawDisplayName,
      };
    }

    // 4. 查 user_profiles：兼容 display_name=33 / cn_name=黄丹 / en_name=debbiehuang。
    if (window.supabase && rawDisplayName) {
      try {
        const { data, error } = await window.supabase
          .from("user_profiles")
          .select("en_name, cn_name, display_name")
          .or(`display_name.eq.${rawDisplayName},cn_name.eq.${rawDisplayName},en_name.eq.${rawDisplayName}`)
          .limit(1);

        if (!error && Array.isArray(data) && data.length > 0 && data[0].en_name) {
          const en = safeEnName(data[0].en_name);
          if (en) {
            return {
              enName: en,
              email: `${en}@webank.com`,
              displayName: data[0].display_name || data[0].cn_name || rawDisplayName,
            };
          }
        }
      } catch (err) {
        console.warn("从 user_profiles 解析通知对象失败：", err);
      }
    }

    // 5. 再查 users 表，兼容少量历史数据。
    if (window.supabase && rawDisplayName) {
      try {
        const { data, error } = await window.supabase
          .from("users")
          .select("email, name, enName")
          .or(`name.eq.${rawDisplayName},enName.eq.${rawDisplayName},email.eq.${rawDisplayName}`)
          .limit(1);

        if (!error && Array.isArray(data) && data.length > 0) {
          const row = data[0];
          const email = safeWebankEmail(row.email, row.enName);
          const en = safeEnName(row.enName) || (email ? email.split("@")[0] : null);
          if (email && en) {
            return {
              enName: en,
              email,
              displayName: row.name || rawDisplayName || en,
            };
          }
        }
      } catch (err) {
        console.warn("从 users 解析通知对象失败：", err);
      }
    }

    return {
      enName: null,
      email: null,
      displayName: rawDisplayName || rawEnName || rawEmail || "未知对象",
    };
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

      const target = await resolveTargetFromProfiles({
        targetEnName,
        targetDisplayName,
        targetEmail,
      });

      if (!target.email) {
        console.warn("非法通知邮箱，已拦截：", targetEmail, targetEnName, targetDisplayName);
        return {
          ok: false,
          error: "通知邮箱必须是 @webank.com，且需要能从 user_profiles/users 解析",
          target,
        };
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

        target_en_name: target.enName,
        target_display_name: cleanText(target.displayName || targetDisplayName || target.enName, 80),
        target_email: target.email,
        mobile: cleanText(mobile, 30) || null,

        title: cleanTitle,
        content: cleanContent,
        action_url: safeActionUrl(actionUrl, cleanTaskId),

        email_status: "pending",
        bot_status: "pending",
      };

      const { error } = await window.supabase
        .from("notification_events")
        .insert([payload]);

      if (error) throw error;

      console.log("✅ notification_events 已写入:", payload);
      return { ok: true, payload };
    } catch (err) {
      console.error("❌ notification_events 写入失败:", err);
      return { ok: false, error: err.message || String(err) };
    }
  };
})();

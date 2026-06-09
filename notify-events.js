// notify-events.js
// 安全版：站外通知事件中转层
// 最终修复：不再依赖 user_profiles 视图新增 email；改查真实映射表 notify_user_map。
// 你需要先在 Supabase SQL Editor 创建 notify_user_map 表，并把 en_name/cn_name/display_name 映射进去。
// Bot 仍然通过 notification_events 巡检后用内部邮箱发件。

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

  function normalize(value) {
    return cleanText(value, 120).toLowerCase();
  }

  function safeEnName(value) {
    const v = normalize(value);
    return EN_NAME_RE.test(v) ? v : null;
  }

  function safeWebankEmail(email, enName) {
    let e = normalize(email);
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

  async function resolveFromNotifyUserMap(rawValue) {
    const key = normalize(rawValue);
    if (!window.supabase || !key) return null;

    try {
      const { data, error } = await window.supabase
        .from("notify_user_map")
        .select("alias, en_name, display_name, email")
        .eq("alias", key)
        .limit(1);

      if (error) {
        console.warn("notify_user_map 查询失败：", error);
        return null;
      }

      const row = Array.isArray(data) ? data[0] : null;
      if (!row) return null;

      const email = safeWebankEmail(row.email, row.en_name);
      const en = safeEnName(row.en_name) || (email ? email.split("@")[0] : null);
      if (!email || !en) return null;

      return {
        enName: en,
        email,
        displayName: cleanText(row.display_name || row.alias || rawValue, 80),
      };
    } catch (err) {
      console.warn("从 notify_user_map 解析通知对象异常：", err);
      return null;
    }
  }

  async function resolveTarget({ targetEnName, targetDisplayName, targetEmail }) {
    const rawEmail = normalize(targetEmail);
    const rawEnName = normalize(targetEnName);
    const rawDisplayName = cleanText(targetDisplayName, 80);

    // 1. 邮箱优先
    if (WEBANK_EMAIL_RE.test(rawEmail)) {
      const en = rawEmail.split("@")[0];
      return {
        enName: safeEnName(rawEnName) || en,
        email: rawEmail,
        displayName: rawDisplayName || rawEnName || en,
      };
    }

    // 2. 英文名其次
    const directEn = safeEnName(rawEnName);
    if (directEn) {
      return {
        enName: directEn,
        email: `${directEn}@webank.com`,
        displayName: rawDisplayName || directEn,
      };
    }

    // 3. displayName 如果本身是英文名，也可以直接拼邮箱
    const displayAsEn = safeEnName(rawDisplayName);
    if (displayAsEn) {
      return {
        enName: displayAsEn,
        email: `${displayAsEn}@webank.com`,
        displayName: rawDisplayName,
      };
    }

    // 4. 真实映射表：支持 33 / 黄丹 / debbiehuang 都查到 debbiehuang@webank.com
    const byMap =
      (await resolveFromNotifyUserMap(rawDisplayName)) ||
      (await resolveFromNotifyUserMap(rawEnName)) ||
      (await resolveFromNotifyUserMap(rawEmail));

    if (byMap) return byMap;

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

      const target = await resolveTarget({
        targetEnName,
        targetDisplayName,
        targetEmail,
      });

      if (!target.email) {
        console.warn("非法通知邮箱，已拦截：", targetEmail, targetEnName, targetDisplayName, target);
        return {
          ok: false,
          error: "通知对象没有在 notify_user_map 中找到邮箱",
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

      const { data, error } = await window.supabase
        .from("notification_events")
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      console.log("✅ notification_events 已写入:", data || payload);
      return { ok: true, payload: data || payload };
    } catch (err) {
      console.error("❌ notification_events 写入失败:", err);
      return { ok: false, error: err.message || String(err) };
    }
  };
})();

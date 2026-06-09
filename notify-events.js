// notify-events.js
// 安全版：站外通知事件中转层
// 修复版：设计师页面催需求方时，支持 display_name = 33 -> user_profiles.en_name -> @webank.com
// 关键修复：不再使用 Supabase .or(...) 查询 user_profiles，避免 display_name=33 时 PostgREST 400。
// 真正发邮件仍由 Bot 巡检 notification_events 后使用内部邮箱能力发送。

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

  async function resolveFromUserProfiles(rawValue) {
    const key = normalize(rawValue);
    if (!window.supabase || !key) return null;

    try {
      // 不使用 .or(...)，避免 display_name=33 时 PostgREST 解析 400。
      // 当前 user_profiles 量很小，直接拉轻量字段后前端匹配最稳。
      const { data, error } = await window.supabase
        .from("user_profiles")
        .select("en_name, cn_name, display_name");

      if (error) {
        console.warn("user_profiles 查询失败：", error);
        return null;
      }

      if (!Array.isArray(data)) return null;

      const matched = data.find((row) => {
        const en = normalize(row.en_name);
        const cn = normalize(row.cn_name);
        const display = normalize(row.display_name);
        return en === key || cn === key || display === key;
      });

      if (!matched || !matched.en_name) return null;

      const en = safeEnName(matched.en_name);
      if (!en) return null;

      return {
        enName: en,
        email: `${en}@webank.com`,
        displayName: cleanText(matched.display_name || matched.cn_name || rawValue, 80),
      };
    } catch (err) {
      console.warn("从 user_profiles 解析通知对象异常：", err);
      return null;
    }
  }

  async function resolveFromUsers(rawValue) {
    const key = normalize(rawValue);
    if (!window.supabase || !key) return null;

    try {
      // 同样不使用 .or(...)，避免特殊昵称导致 400。
      const { data, error } = await window.supabase
        .from("users")
        .select("email, name, enName");

      if (error) {
        console.warn("users 查询失败：", error);
        return null;
      }

      if (!Array.isArray(data)) return null;

      const matched = data.find((row) => {
        const email = normalize(row.email);
        const name = normalize(row.name);
        const en = normalize(row.enName);
        return email === key || name === key || en === key;
      });

      if (!matched) return null;

      const email = safeWebankEmail(matched.email, matched.enName);
      const en = safeEnName(matched.enName) || (email ? email.split("@")[0] : null);

      if (!email || !en) return null;

      return {
        enName: en,
        email,
        displayName: cleanText(matched.name || rawValue || en, 80),
      };
    } catch (err) {
      console.warn("从 users 解析通知对象异常：", err);
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

    // 3. displayName 如果是英文名，也可以直接拼邮箱
    const displayAsEn = safeEnName(rawDisplayName);
    if (displayAsEn) {
      return {
        enName: displayAsEn,
        email: `${displayAsEn}@webank.com`,
        displayName: rawDisplayName,
      };
    }

    // 4. displayName / 中文名 / 昵称从 user_profiles 解析。这里就是修 33 的关键。
    const byProfile =
      (await resolveFromUserProfiles(rawDisplayName)) ||
      (await resolveFromUserProfiles(rawEnName)) ||
      (await resolveFromUserProfiles(rawEmail));

    if (byProfile) return byProfile;

    // 5. users 表兜底
    const byUser =
      (await resolveFromUsers(rawDisplayName)) ||
      (await resolveFromUsers(rawEnName)) ||
      (await resolveFromUsers(rawEmail));

    if (byUser) return byUser;

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

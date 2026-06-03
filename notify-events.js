// notify-events.js
// 站外通知事件中转层：只负责写入 notification_events
// 后续邮件服务、机器人定时提醒都读取这张表

window.createNotifyEvent = async function ({
  taskId,
  eventType,
  targetEnName,
  targetDisplayName,
  targetEmail,
  mobile,
  title,
  content,
  actionUrl
}) {
  try {
    if (!window.supabase) {
      console.warn('Supabase 未初始化，无法创建通知事件');
      return { ok: false, error: 'Supabase 未初始化' };
    }

    if (!title || !content) {
      console.warn('通知标题或内容为空，跳过创建通知事件');
      return { ok: false, error: '通知标题或内容为空' };
    }

    const payload = {
      task_id: taskId || null,
      event_type: eventType || 'general',

      target_en_name: targetEnName || null,
      target_display_name: targetDisplayName || targetEnName || null,
      target_email: targetEmail || (targetEnName ? `${targetEnName}@webank.com` : null),
      mobile: mobile || null,

      title,
      content,
      action_url: actionUrl || null,

      email_status: 'pending',
      bot_status: 'pending'
    };

    const { error } = await window.supabase
      .from('notification_events')
      .insert([payload]);

    if (error) throw error;

    console.log('✅ notification_events 已写入:', payload.title);
    return { ok: true };

  } catch (err) {
    console.error('❌ notification_events 写入失败:', err);
    return { ok: false, error: err.message || String(err) };
  }
};
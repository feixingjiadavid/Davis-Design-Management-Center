function policyError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function normalizeEnName(value) {
  const enName = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(enName)) {
    throw policyError('账号格式无效', 400);
  }
  return enName;
}

export function authorizeDisableUser({
  actorId,
  actorRole,
  actorDisabled,
  targetId,
}) {
  if (!actorId) throw policyError('未登录或登录已过期', 401);
  if (actorDisabled || actorRole !== 'admin') {
    throw policyError('仅启用状态的系统管理员可以注销成员权限', 403);
  }
  if (!targetId) throw policyError('未找到要注销的成员账号', 404);
  if (actorId === targetId) {
    throw policyError('不能注销当前正在使用的管理员账号', 409);
  }
  return true;
}

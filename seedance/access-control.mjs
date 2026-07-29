const VIDEO_SUPER_ADMIN_EMAILS = new Set([
  'davidxxu@webank.com',
  'judyzzhang@webank.com',
]);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isVideoSuperAdmin(user) {
  return VIDEO_SUPER_ADMIN_EMAILS.has(normalizeEmail(user?.email));
}

export function isForeignVideoOwner(user, ownerId) {
  const currentUserId = String(user?.id || '').trim();
  const recordOwnerId = String(ownerId || '').trim();
  if (!currentUserId || !recordOwnerId) return true;
  return currentUserId !== recordOwnerId;
}

export function canMutateVideoOwner(user, ownerId) {
  return !isForeignVideoOwner(user, ownerId);
}

export function scopeVideoRead(query, user, ownerColumn = 'owner_id') {
  if (!query || typeof query.eq !== 'function') {
    throw new TypeError('A Supabase query builder is required');
  }
  if (isVideoSuperAdmin(user)) return query;

  const userId = String(user?.id || '').trim();
  if (!userId) return query.eq(ownerColumn, '__missing_authenticated_user__');
  return query.eq(ownerColumn, userId);
}

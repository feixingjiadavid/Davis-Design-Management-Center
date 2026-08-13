const VIDEO_SUPER_ADMIN_EMAILS = new Set([
  'davidxxu@webank.com',
  'judyzzhang@webank.com',
]);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function authenticatedUserId(user) {
  return String(user?.id || '').trim();
}

export function isVideoSuperAdmin(user) {
  return VIDEO_SUPER_ADMIN_EMAILS.has(normalizeEmail(user?.email));
}

export function isForeignVideoOwner(user, ownerId) {
  const currentUserId = authenticatedUserId(user);
  const recordOwnerId = String(ownerId || '').trim();
  if (!currentUserId || !recordOwnerId) return true;
  return currentUserId !== recordOwnerId;
}

// Video Studio is a shared internal workspace. Any authenticated system user may
// collaborate on an existing video project. Ownership is retained for audit,
// billing attribution, and destructive operations only.
export function canMutateVideoOwner(user) {
  return Boolean(authenticatedUserId(user));
}

export function canDeleteVideoOwner(user, ownerId) {
  const currentUserId = authenticatedUserId(user);
  const recordOwnerId = String(ownerId || '').trim();
  return Boolean(currentUserId && recordOwnerId && currentUserId === recordOwnerId);
}

export function scopeVideoRead(query, user, ownerColumn = 'owner_id') {
  if (!query || typeof query.eq !== 'function') {
    throw new TypeError('A Supabase query builder is required');
  }

  const userId = authenticatedUserId(user);
  if (!userId) return query.eq(ownerColumn, '__missing_authenticated_user__');

  // All authenticated system users share the Video Studio project space.
  return query;
}

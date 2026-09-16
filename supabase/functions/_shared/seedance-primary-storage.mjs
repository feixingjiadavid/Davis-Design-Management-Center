export const PRIMARY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function primaryStorageExpired(output, nowMs = Date.now()) {
  const expiresAt = Date.parse(String(
    output?.primary_storage_expires_at ||
    output?.metadata?.primary_storage_expires_at ||
    ''
  ));
  return Number.isFinite(expiresAt) && expiresAt <= nowMs;
}

export function hasSupabasePrimary(output) {
  const bucket = String(output?.bucket_id || output?.metadata?.supabase_bucket || '');
  const path = String(output?.storage_path || output?.metadata?.supabase_path || '');
  const status = String(
    output?.primary_storage_status ||
    output?.metadata?.primary_storage_status ||
    ''
  ).toLowerCase();
  return bucket === 'seedance-outputs' && Boolean(path) && status === 'completed';
}

export function hasRealDriveBackup(output) {
  const id = String(
    output?.google_drive_file_id ||
    output?.metadata?.google_drive_file_id ||
    ''
  ).trim();
  return Boolean(id) && !id.startsWith('supabase:');
}

export function choosePlaybackBackend(output, nowMs = Date.now()) {
  if (hasSupabasePrimary(output) && !primaryStorageExpired(output, nowMs)) return 'supabase';
  if (hasRealDriveBackup(output)) return 'google_drive';
  return 'unavailable';
}

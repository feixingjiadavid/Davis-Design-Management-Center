import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIMARY_RETENTION_MS,
  choosePlaybackBackend,
  primaryStorageExpired,
} from '../_shared/seedance-primary-storage.mjs';

test('uses Supabase as the primary playback source during the 7-day retention window', () => {
  const now = Date.parse('2026-09-16T03:00:00Z');
  const output = {
    bucket_id: 'seedance-outputs',
    storage_path: 'outputs/u/o.mp4',
    primary_storage_status: 'completed',
    primary_storage_expires_at: new Date(now + PRIMARY_RETENTION_MS).toISOString(),
    google_drive_file_id: 'drive-file-id',
  };
  assert.equal(choosePlaybackBackend(output, now), 'supabase');
});

test('switches playback to Google Drive after the Supabase retention window expires', () => {
  const now = Date.parse('2026-09-24T03:00:00Z');
  const output = {
    bucket_id: 'seedance-outputs',
    storage_path: 'outputs/u/o.mp4',
    primary_storage_status: 'completed',
    primary_storage_expires_at: '2026-09-23T03:00:00Z',
    google_drive_file_id: 'drive-file-id',
  };
  assert.equal(primaryStorageExpired(output, now), true);
  assert.equal(choosePlaybackBackend(output, now), 'google_drive');
});

test('does not let Drive backup availability override a valid Supabase primary copy', () => {
  const now = Date.parse('2026-09-16T03:00:00Z');
  const output = {
    bucket_id: 'seedance-outputs',
    storage_path: 'outputs/u/o.mp4',
    primary_storage_status: 'completed',
    primary_storage_expires_at: '2026-09-20T03:00:00Z',
    google_drive_file_id: 'drive-file-id',
  };
  assert.equal(choosePlaybackBackend(output, now), 'supabase');
});

test('returns unavailable when the primary copy has expired and Drive backup is missing', () => {
  const now = Date.parse('2026-09-24T03:00:00Z');
  const output = {
    bucket_id: 'seedance-outputs',
    storage_path: 'outputs/u/o.mp4',
    primary_storage_status: 'expired',
    primary_storage_expires_at: '2026-09-23T03:00:00Z',
    google_drive_file_id: null,
  };
  assert.equal(choosePlaybackBackend(output, now), 'unavailable');
});

import { createHash } from 'node:crypto';

export function memoContentSha256(note) {
  return createHash('sha256')
    .update(JSON.stringify({ id: note.id, owner_id: note.owner_id, title: note.title, body: note.body }))
    .digest('hex');
}

export function validateMemoBackup(backup, expectedId, expectedOwnerId, expectedHash) {
  if (!backup || backup.schema !== 'aleph.private-memo-backup.v1'
      || !backup.note || typeof backup.note !== 'object') {
    return { ok: false, reason: 'BACKUP_MISSING_OR_INVALID' };
  }
  const note = backup.note;
  if (note.id !== expectedId) return { ok: false, reason: 'BACKUP_ID_MISMATCH' };
  if (note.owner_id !== expectedOwnerId) return { ok: false, reason: 'BACKUP_OWNER_MISMATCH' };
  if (typeof note.title !== 'string' || typeof note.body !== 'string') {
    return { ok: false, reason: 'BACKUP_CONTENT_INVALID' };
  }
  const actualHash = memoContentSha256(note);
  if (actualHash !== note.contentSha256 || actualHash !== expectedHash) {
    return { ok: false, reason: 'BACKUP_HASH_MISMATCH' };
  }
  return { ok: true, note: { id: note.id, owner_id: note.owner_id, resource_type: 'memo', title: note.title, body: note.body }, contentSha256: actualHash };
}

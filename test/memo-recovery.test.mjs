import test from 'node:test';
import assert from 'node:assert/strict';
import { memoContentSha256, validateMemoBackup } from '../src/memo-recovery.mjs';

const note = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', owner_id: 'test-user-b', title: '가상 메모', body: '시험용 가상 내용' };
const hash = memoContentSha256(note);
const backup = { schema: 'aleph.private-memo-backup.v1', note: { ...note, contentSha256: hash } };

test('valid private backup validates ID, owner, and content hash', () => {
  assert.equal(validateMemoBackup(backup, note.id, note.owner_id, hash).ok, true);
});
test('restore rejects wrong ID, owner, or content hash', () => {
  assert.equal(validateMemoBackup(backup, 'different-id', note.owner_id, hash).reason, 'BACKUP_ID_MISMATCH');
  assert.equal(validateMemoBackup(backup, note.id, 'test-user-a', hash).reason, 'BACKUP_OWNER_MISMATCH');
  assert.equal(validateMemoBackup(backup, note.id, note.owner_id, 'f'.repeat(64)).reason, 'BACKUP_HASH_MISMATCH');
});

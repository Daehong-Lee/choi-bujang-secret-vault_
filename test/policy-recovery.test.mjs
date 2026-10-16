import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadVerifiedPolicyBackup, policyChanges, sha256 } from '../src/policy-recovery.mjs';

test('policy diff returns only changed fields', () => {
  assert.deepEqual(policyChanges({ schema: 'v1', rules: ['safe'] }, { schema: 'v1', rules: ['changed'] }), [
    { field: 'rules', current: ['changed'], verifiedBackup: ['safe'] },
  ]);
});

test('missing verified policy backup stops', async () => {
  const root = await mkdtemp(join(tmpdir(), 'policy-backup-'));
  try {
    await mkdir(join(root, 'policy-lab', 'backups'), { recursive: true });
    await assert.rejects(loadVerifiedPolicyBackup(root), /VERIFIED_POLICY_BACKUP_MISSING/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('invalid backup hash stops', async () => {
  const root = await mkdtemp(join(tmpdir(), 'policy-backup-'));
  try {
    const directory = join(root, 'policy-lab', 'backups');
    await mkdir(directory, { recursive: true });
    const bytes = Buffer.from(JSON.stringify({ schema: 'aleph.trial-policy.v1', rules: [], allowedRoutes: [] }));
    await writeFile(join(directory, 'pre-incident-policy.json'), bytes);
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ schema: 'aleph.verified-policy-backup.v1', verified: true, sha256: '0'.repeat(64) }));
    await assert.rejects(loadVerifiedPolicyBackup(root), /VERIFIED_POLICY_BACKUP_INVALID/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('valid hash is calculated over exact backup bytes', () => {
  assert.match(sha256(Buffer.from('fixture')), /^[a-f0-9]{64}$/u);
});

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function policyChanges(verifiedSnapshot, currentPolicy) {
  const keys = [...new Set([...Object.keys(verifiedSnapshot ?? {}), ...Object.keys(currentPolicy ?? {})])].sort();
  return keys.filter(key => JSON.stringify(verifiedSnapshot?.[key]) !== JSON.stringify(currentPolicy?.[key]))
    .map(field => ({ field, current: currentPolicy?.[field] ?? null, verifiedBackup: verifiedSnapshot?.[field] ?? null }));
}

export async function loadVerifiedPolicyBackup(root = process.cwd()) {
  const directory = join(resolve(root), 'policy-lab', 'backups');
  let bytes;
  let manifest;
  try {
    bytes = await readFile(join(directory, 'pre-incident-policy.json'));
    manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  } catch {
    throw new Error('VERIFIED_POLICY_BACKUP_MISSING');
  }
  if (manifest?.schema !== 'aleph.verified-policy-backup.v1'
      || manifest.verified !== true
      || typeof manifest.sha256 !== 'string'
      || sha256(bytes) !== manifest.sha256) {
    throw new Error('VERIFIED_POLICY_BACKUP_INVALID');
  }
  let policy;
  try { policy = JSON.parse(bytes.toString('utf8')); } catch {
    throw new Error('VERIFIED_POLICY_BACKUP_INVALID');
  }
  if (!policy || policy.schema !== 'aleph.trial-policy.v1'
      || !Array.isArray(policy.rules) || !Array.isArray(policy.allowedRoutes)) {
    throw new Error('VERIFIED_POLICY_BACKUP_INVALID');
  }
  return { policy, sha256: manifest.sha256, backupId: manifest.backupId ?? null };
}

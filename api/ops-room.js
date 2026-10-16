import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RULE_IDS } from '../src/decider.mjs';
import { loadVerifiedPolicyBackup } from '../src/policy-recovery.mjs';

const root = process.cwd();
const config = JSON.parse(await readFile(join(root, 'aleph.config.json'), 'utf8'));
const xdrModules = ['brute-force', 'web-injection', 'known-cve', 'persistence', 'privilege', 'exfiltration'];
const attackPlan = Array.from({ length: 41 }, (_, index) => ({
  attackId: `attack-${String(index + 1).padStart(2, '0')}`,
  status: 'not_run',
}));

async function readJson(path) {
  try { return JSON.parse(await readFile(join(root, path), 'utf8')); }
  catch { return null; }
}

async function recoverySummary() {
  try {
    const backup = await loadVerifiedPolicyBackup(root);
    return { status: 'verified_backup_available', backupId: backup.backupId, sha256: backup.sha256,
      target: 'policy-lab/current-policy.json', changes: 'not_applied' };
  } catch (error) {
    return { status: error.message === 'VERIFIED_POLICY_BACKUP_MISSING' ? 'backup_missing' : 'backup_invalid',
      backupId: null, sha256: null, target: 'policy-lab/current-policy.json', changes: 'not_available' };
  }
}

export default async function handler(_req, res) {
  const detection = [];
  for (const moduleKey of xdrModules) {
    const result = await readJson(`xdr/${moduleKey}/result.json`);
    if (!result) {
      detection.push({ moduleKey, source: 'virtual_fixture', status: 'not_run', counts: null });
      continue;
    }
    detection.push({ moduleKey, source: 'virtual_fixture', status: 'executed', counts: result.counts ?? null });
  }
  const policy = await readJson('policy-lab/current-policy.json');
  const response = {
    schema: 'aleph.ops-room.v1',
    generatedAt: new Date().toISOString(),
    step: config.step,
    rules: RULE_IDS.map(ruleId => ({ ruleId, source: 'student_decider' })),
    detection,
    recovery: await recoverySummary(),
    policy: policy ? { revision: policy.revision, ruleCount: policy.rules.length, routeCount: policy.allowedRoutes.length } : null,
    accessApp: { manifest: '/manifest.webmanifest', deviceApproval: '/api/device-approval', protectedNotes: '/api/notes' },
    attackPlan,
    evidence: {
      note: '이 API는 규칙·탐지·복구 메타데이터만 반환합니다. 가상 메모 본문, 토큰, 비밀키는 반환하지 않습니다.',
      apiChecks: '이 화면에서 실제 HTTP 요청을 실행한 항목만 실측으로 기록해야 하며, 실행하지 않은 항목은 미실행으로 남깁니다.',
    },
  };
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json(response);
}

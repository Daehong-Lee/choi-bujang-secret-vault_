import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadVerifiedPolicyBackup, policyChanges } from '../src/policy-recovery.mjs';

const root = resolve(import.meta.dirname, '..');
const currentPath = join(root, 'policy-lab', 'current-policy.json');
const apply = process.argv.includes('--apply');
try {
  const { policy: backup, sha256, backupId } = await loadVerifiedPolicyBackup(root);
  const current = JSON.parse(await readFile(currentPath, 'utf8'));
  const changedFields = policyChanges(backup, current);
  console.log(JSON.stringify({
    action: apply ? 'restore_trial_policy' : 'preview_only',
    backupId,
    backupSha256: sha256,
    target: 'policy-lab/current-policy.json (시험 정책만; 실제 운영 정책 제외)',
    changedFields,
    auditHistory: '보존: 감사 기록을 변경하지 않음',
    confirmationRequired: apply && changedFields.length > 0,
  }, null, 2));
  if (!apply) {
    console.log('미리보기만 완료했습니다. 사전 백업과 해시 검증이 성공한 경우에만 차이를 표시합니다.');
  } else {
    if (process.env.CONFIRM_POLICY_RESTORE !== 'YES') {
      throw new Error('RESTORE_CONFIRMATION_REQUIRED: 변경 항목을 확인한 뒤 CONFIRM_POLICY_RESTORE=YES로 실행하세요.');
    }
    await writeFile(currentPath, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');
    console.log('시험 정책 복구 완료. 운영 정책과 감사 기록은 변경하지 않았습니다.');
  }
} catch (error) {
  console.error(`정책 복구 중단: ${error.message}`);
  process.exitCode = 1;
}

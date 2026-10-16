import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../../src/verify-login.mjs';
import { memoContentSha256, validateMemoBackup } from '../../src/memo-recovery.mjs';

const config = JSON.parse(await readFile(join(process.cwd(), 'aleph.config.json'), 'utf8'));
const secretKey = process.env.SUPABASE_SECRET_KEY;
const verifyLoginAuthorization = createLoginVerifier({ config, supabaseSecretKey: secretKey });

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'POST만 허용됩니다.', reason: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const { userId } = (await verifyLoginAuthorization(req.headers?.authorization)) ?? {};
    if (!userId) return json(res, 401, { error: '로그인이 필요합니다.', reason: 'AUTH_REQUIRED' });
    if (!process.env.SUPABASE_URL || !secretKey || !process.env.RESTORE_BACKUP_BUCKET
        || !process.env.RESTORE_BACKUP_OBJECT || !process.env.RESTORE_TEST_OWNER_ID) {
      return json(res, 503, { error: '복구 백업 설정이 없어 중단했습니다.', reason: 'RESTORE_BACKUP_NOT_CONFIGURED' });
    }
    if (userId !== process.env.RESTORE_TEST_OWNER_ID) {
      return json(res, 403, { error: '시험 계정 B만 복구 시험을 실행할 수 있습니다.', reason: 'RESTORE_TEST_OWNER_ONLY' });
    }
    const input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!input || input.confirm !== 'RESTORE_ONE_MEMO'
        || typeof input.id !== 'string' || typeof input.contentSha256 !== 'string') {
      return json(res, 400, { error: '복구 대상 ID, 내용 해시, 확인 문구가 필요합니다.', reason: 'RESTORE_CONFIRMATION_REQUIRED' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data: file, error: downloadError } = await supabase.storage
      .from(process.env.RESTORE_BACKUP_BUCKET).download(process.env.RESTORE_BACKUP_OBJECT);
    if (downloadError || !file) return json(res, 503, { error: '비공개 메모 사본을 읽지 못했습니다.', reason: 'RESTORE_BACKUP_UNAVAILABLE' });

    let backup;
    try { backup = JSON.parse(await file.text()); } catch {
      return json(res, 503, { error: '백업 JSON 검증에 실패했습니다.', reason: 'RESTORE_BACKUP_INVALID' });
    }
    const verified = validateMemoBackup(backup, input.id, userId, input.contentSha256);
    if (!verified.ok) return json(res, 409, { error: '백업 ID·소유자·내용 해시가 일치하지 않습니다.', reason: verified.reason });

    const { data: existing, error: lookupError } = await supabase.from('learning_notes')
      .select('id, resource_type, owner_id, title, body').eq('id', input.id).maybeSingle();
    if (lookupError) return json(res, 503, { error: '복구 대상을 확인하지 못했습니다.', reason: 'RESTORE_TARGET_LOOKUP_FAILED' });
    if (existing && (existing.owner_id !== userId || existing.resource_type !== 'memo')) {
      return json(res, 403, { error: '다른 소유자 또는 다른 자원 구역은 변경하지 않습니다.', reason: 'RESTORE_TARGET_FORBIDDEN' });
    }

    const result = existing
      ? await supabase.from('learning_notes').update({ title: verified.note.title, body: verified.note.body })
          .eq('id', input.id).eq('owner_id', userId).eq('resource_type', 'memo')
          .select('id, resource_type, owner_id, title, body').maybeSingle()
      : await supabase.from('learning_notes').insert(verified.note)
          .select('id, resource_type, owner_id, title, body').single();
    const restored = result.data;
    if (result.error || !restored || restored.id !== input.id || restored.owner_id !== userId
        || restored.resource_type !== 'memo' || memoContentSha256(restored) !== verified.contentSha256) {
      return json(res, 503, { error: '복구 결과 검증에 실패했습니다.', reason: 'RESTORE_RESULT_UNVERIFIED' });
    }
    // This handler does not touch other memo rows or audit records.
    return json(res, 200, { restored: true, id: restored.id, ownerId: restored.owner_id,
      contentSha256: verified.contentSha256, auditHistory: 'preserved' });
  } catch (error) {
    if (error instanceof SyntaxError) return json(res, 400, { error: 'JSON 형식이 올바르지 않습니다.', reason: 'INVALID_JSON' });
    return json(res, 500, { error: '메모 복구를 처리하지 못했습니다.', reason: 'RESTORE_FAILED' });
  }
}

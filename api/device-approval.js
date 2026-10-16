import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { createDeviceChallenge, verifyDeviceAssertion } from '../src/device-approval.mjs';

const root = process.cwd();
const config = JSON.parse(await readFile(join(root, 'aleph.config.json'), 'utf8'));
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const verifyLoginAuthorization = createLoginVerifier({ config, supabaseSecretKey });
const origin = new URL(config.publicAppUrl).origin;
const rpId = new URL(config.publicAppUrl).hostname;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method Not Allowed', reason: 'METHOD_NOT_ALLOWED' });
  }
  const identity = await verifyLoginAuthorization(req.headers?.authorization);
  if (!identity?.userId) return json(res, 401, { error: '로그인이 필요합니다.', reason: 'AUTH_REQUIRED' });

  const body = parseBody(req);
  try {
    if (body.action === 'challenge') {
      const challenge = createDeviceChallenge({ origin, rpId });
      return json(res, 200, {
        challengeToken: challenge.challengeToken,
        challenge: challenge.challenge,
        rpId: challenge.rpId,
        credentialIds: JSON.parse(process.env.REGISTERED_DEVICE_CREDENTIALS_JSON || '[]')
          .filter(item => typeof item?.id === 'string').map(item => item.id),
      });
    }
    if (body.action === 'verify') {
      const approvalToken = verifyDeviceAssertion({
        assertion: body.assertion,
        challengeToken: body.challengeToken,
        userId: identity.userId,
        origin,
        rpId,
      });
      return json(res, 200, { approved: true, approvalToken, expiresIn: 600 });
    }
    return json(res, 400, { error: '기기 승인 요청 형식이 올바르지 않습니다.', reason: 'INVALID_DEVICE_REQUEST' });
  } catch (error) {
    const reason = error?.message || 'DEVICE_APPROVAL_FAILED';
    const status = ['DEVICE_NOT_REGISTERED', 'DEVICE_REGISTRY_NOT_CONFIGURED', 'DEVICE_REGISTRY_INVALID'].includes(reason)
      ? 403 : reason === 'DEVICE_APPROVAL_NOT_CONFIGURED' ? 503 : 400;
    return json(res, status, {
      approved: false,
      error: status === 403 ? '서버에 등록된 기기로 확인되지 않았습니다.' : '기기 승인을 완료하지 못했습니다.',
      reason,
    });
  }
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import { decide } from './decider.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function deny(reason = 'ENGINE_CONTEXT_INVALID', status = 403) {
  return { allowed: false, status, reason };
}

function requestPath(req) {
  if (typeof req?.url !== 'string') return null;
  let parsed;
  try { parsed = new URL(req.url, 'https://local.invalid'); } catch { return null; }
  if (parsed.search || parsed.hash) return null;
  return parsed.pathname;
}

/**
 * Verifies a server-to-server engine envelope. The browser must never mint this
 * envelope. Payload is base64url(JSON.stringify({ loginUserId, decisionRequest }));
 * signature is lowercase hex HMAC-SHA256(payload, ALEPH_ENGINE_CONTEXT_SECRET).
 */
export async function authorizeWithEngine({ req, identity, service, id }) {
  const encoded = req?.headers?.['x-aleph-engine-context'];
  const suppliedSignature = req?.headers?.['x-aleph-engine-signature'];
  if (encoded == null && suppliedSignature == null) return { present: false };
  if (typeof encoded !== 'string' || typeof suppliedSignature !== 'string'
      || !/^[A-Za-z0-9_-]{1,12000}$/u.test(encoded)
      || !/^[0-9a-f]{64}$/u.test(suppliedSignature)) return { present: true, ...deny() };

  const secret = process.env.ALEPH_ENGINE_CONTEXT_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    return { present: true, ...deny('ENGINE_CONTEXT_NOT_CONFIGURED', 503) };
  }
  const expected = createHmac('sha256', secret).update(encoded).digest();
  const actual = Buffer.from(suppliedSignature, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { present: true, ...deny() };
  }

  let envelope;
  try { envelope = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
  catch { return { present: true, ...deny() }; }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
      || Object.keys(envelope).sort().join(',') !== 'decisionRequest,loginUserId'
      || envelope.loginUserId !== identity?.userId) {
    return { present: true, ...deny('ENGINE_IDENTITY_MISMATCH') };
  }

  const request = envelope.decisionRequest;
  const actualPath = requestPath(req);
  const canonicalPath = `/${service}/${id}`;
  const expectedRoute = `${req.method} /${service}/:id`;
  if (!UUID.test(id ?? '') || actualPath !== `/api${canonicalPath}`
      || request?.path !== canonicalPath || request?.method !== req.method
      || request?.service !== service || request?.route !== expectedRoute
      || request?.queryLength !== 0 || request?.querySha256 !== EMPTY_SHA256) {
    return { present: true, ...deny('ENGINE_REQUEST_MISMATCH') };
  }

  const expectedRole = identity?.kind === 'judge' ? 'instructor' : 'student';
  if (request.actorRole !== expectedRole) {
    return { present: true, ...deny('ENGINE_ROLE_MISMATCH') };
  }

  // This helper verifies the signed engine context and the request path only.
  // Resource ownership is deliberately enforced by the API against the persisted row.

  let decision;
  try { decision = await decide(request); }
  catch { return { present: true, ...deny() }; }
  if (decision?.decision !== 'allow') {
    return { present: true, ...deny(decision?.reasonCode || 'ENGINE_DENIED') };
  }
  return { present: true, allowed: true, decision };
}

export function engineContextRequired(result, { required = true } = {}) {
  if (!result?.present) return required ? deny('ENGINE_CONTEXT_REQUIRED') : { allowed: true };
  return result;
}

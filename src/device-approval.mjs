import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';

const TOKEN_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const MAX_AGE_SECONDS = 10 * 60;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function parseJson(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function secret() {
  const value = process.env.DEVICE_APPROVAL_SECRET;
  if (typeof value !== 'string' || value.length < 32) throw new Error('DEVICE_APPROVAL_NOT_CONFIGURED');
  return value;
}

function signPayload(payload) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifySignedPayload(token, kind) {
  if (typeof token !== 'string' || token.length > 8192 || !TOKEN_RE.test(token)) return null;
  const [encoded, supplied] = token.split('.');
  const expected = createHmac('sha256', secret()).update(encoded).digest('base64url');
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const payload = parseJson(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!payload || payload.kind !== kind || !Number.isSafeInteger(payload.exp)
      || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function registry() {
  const raw = process.env.REGISTERED_DEVICE_CREDENTIALS_JSON;
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('DEVICE_REGISTRY_NOT_CONFIGURED');
  let list;
  try { list = JSON.parse(raw); } catch { throw new Error('DEVICE_REGISTRY_INVALID'); }
  if (!Array.isArray(list) || !list.length || list.length > 50) throw new Error('DEVICE_REGISTRY_INVALID');
  return list;
}

function registeredCredential(id) {
  const credential = registry().find(item => item?.id === id);
  if (!credential || typeof credential.publicKeyJwk !== 'object') throw new Error('DEVICE_NOT_REGISTERED');
  return credential;
}

export function createDeviceChallenge({ origin, rpId } = {}) {
  if (typeof origin !== 'string' || typeof rpId !== 'string' || !origin.startsWith('https://')) {
    throw new Error('DEVICE_APPROVAL_CONFIGURATION_INVALID');
  }
  const challenge = randomBytes(32).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const token = signPayload({ kind: 'device_challenge', challenge, iat: now, exp: now + 5 * 60 });
  return { challengeToken: token, challenge, rpId };
}

function decodeClientData(response) {
  const raw = Buffer.from(response.clientDataJSON, 'base64url');
  const data = parseJson(raw.toString('utf8'));
  if (!data || data.type !== 'webauthn.get' || typeof data.challenge !== 'string'
      || typeof data.origin !== 'string') throw new Error('DEVICE_ASSERTION_INVALID');
  return { raw, data };
}

export function verifyDeviceAssertion({ assertion, challengeToken, userId, origin, rpId } = {}) {
  if (!assertion || typeof assertion !== 'object' || !assertion.response) throw new Error('DEVICE_ASSERTION_INVALID');
  const challenge = verifySignedPayload(challengeToken, 'device_challenge');
  if (!challenge) throw new Error('DEVICE_CHALLENGE_INVALID');
  const credentialId = typeof assertion.id === 'string' ? assertion.id : '';
  if (!credentialId || credentialId !== assertion.rawId) throw new Error('DEVICE_CREDENTIAL_ID_INVALID');
  const credential = registeredCredential(credentialId);
  const { raw: clientDataJSON, data: clientData } = decodeClientData(assertion.response);
  if (clientData.challenge !== challenge.challenge || clientData.origin !== origin) {
    throw new Error('DEVICE_CHALLENGE_MISMATCH');
  }

  const authenticatorData = Buffer.from(assertion.response.authenticatorData, 'base64url');
  if (authenticatorData.length < 37) throw new Error('DEVICE_AUTHENTICATOR_DATA_INVALID');
  const rpHash = createHash('sha256').update(rpId).digest();
  if (!timingSafeEqual(authenticatorData.subarray(0, 32), rpHash)) throw new Error('DEVICE_RP_ID_MISMATCH');
  const flags = authenticatorData[32];
  if ((flags & 0x01) === 0 || (flags & 0x04) === 0) throw new Error('DEVICE_USER_VERIFICATION_REQUIRED');

  const clientDataHash = createHash('sha256').update(clientDataJSON).digest();
  const signedData = Buffer.concat([authenticatorData, clientDataHash]);
  const signature = Buffer.from(assertion.response.signature, 'base64url');
  const publicKey = createPublicKey({ key: credential.publicKeyJwk, format: 'jwk' });
  if (!verify('sha256', signedData, publicKey, signature)) throw new Error('DEVICE_SIGNATURE_INVALID');

  const now = Math.floor(Date.now() / 1000);
  return signPayload({
    kind: 'device_approval', userId, credentialId, iat: now, exp: now + MAX_AGE_SECONDS,
  });
}

export function verifyDeviceApprovalToken(token, userId) {
  const payload = verifySignedPayload(token, 'device_approval');
  return Boolean(payload && payload.userId === userId && typeof payload.credentialId === 'string');
}

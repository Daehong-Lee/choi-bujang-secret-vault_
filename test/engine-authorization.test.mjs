import assert from 'node:assert/strict';
import { createHmac, createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { authorizeWithEngine, engineContextRequired } from '../src/engine-authorization.mjs';

const secret = 'test-only-secret-that-is-at-least-32-characters';
const id = '11111111-1111-4111-8111-111111111111';
const emptyHash = createHash('sha256').update('').digest('hex');
function makeEnvelope(overrides = {}, loginUserId = id) {
  const decisionRequest = {
    schema: 'aleph.decision.v1', requestId: randomUUID(), classId: 'class_fixture',
    projectId: 'project_fixture', subjectId: 'subject-A', resourceOwnerSubjectId: 'subject-A',
    actorRole: 'student', deviceId: 'a'.repeat(16), service: 'notes', method: 'GET',
    path: `/notes/${id}`, route: 'GET /notes/:id', queryLength: 0, querySha256: emptyHash,
    at: new Date().toISOString(), policyRevision: 1, deviceRegistered: true,
    stepUp: { verified: false, authAgeSeconds: null }, recentEvents: [],
    signals: { source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 },
    ...overrides,
  };
  const encoded = Buffer.from(JSON.stringify({ loginUserId, decisionRequest })).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('hex');
  return { encoded, signature };
}
function input(overrides = {}, requestOverrides = {}, loginUserId = id) {
  const envelope = makeEnvelope(requestOverrides, loginUserId);
  process.env.ALEPH_ENGINE_CONTEXT_SECRET = secret;
  return {
    req: { method: 'GET', url: `/api/notes/${id}`, headers: {
      'x-aleph-engine-context': envelope.encoded,
      'x-aleph-engine-signature': envelope.signature,
    } },
    identity: { kind: 'student', userId: id }, service: 'notes', id, ownerUserId: id,
    ...overrides,
  };
}

test('signed engine context allows the authenticated owner to read their own memo', async () => {
  const result = await authorizeWithEngine(input());
  assert.equal(result.present, true);
  assert.equal(result.allowed, true);
});

test('engine context denies a cross-zone memo request and mismatched method/path', async () => {
  const foreign = await authorizeWithEngine(input({}, { subjectId: 'subject-B' }));
  assert.equal(foreign.allowed, false);
  const wrongMethod = await authorizeWithEngine(input({}, { method: 'PUT', route: 'PUT /notes/:id' }));
  assert.equal(wrongMethod.allowed, false);
  const wrongPath = await authorizeWithEngine(input({}, { path: '/notes/export' }));
  assert.equal(wrongPath.allowed, false);
});

test('tampered signature and identity mismatch fail closed; self-read can be explicitly exempted from required context', async () => {
  const invalid = input();
  invalid.req.headers['x-aleph-engine-signature'] = '0'.repeat(64);
  assert.equal((await authorizeWithEngine(invalid)).allowed, false);
  assert.equal((await authorizeWithEngine(input({}, {}, '22222222-2222-4222-8222-222222222222'))).allowed, false);
  const absent = await authorizeWithEngine({ req: { method: 'GET', url: `/api/notes/${id}`, headers: {} }, identity: { userId: id }, service: 'notes', id });
  assert.deepEqual(engineContextRequired(absent), { allowed: false, status: 403, reason: 'ENGINE_CONTEXT_REQUIRED' });
  assert.deepEqual(engineContextRequired(absent, { required: false }), { allowed: true });
});

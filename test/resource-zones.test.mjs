import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { decide } from '../src/decider.mjs';

const hash = createHash('sha256').update('').digest('hex');
function request(overrides = {}) {
  return {
    schema: 'aleph.decision.v1', requestId: randomUUID(), classId: 'class_fixture',
    projectId: 'project_fixture', subjectId: 'subject-A', resourceOwnerSubjectId: 'subject-A',
    actorRole: 'student', deviceId: 'a'.repeat(16), service: 'notes', method: 'GET',
    path: '/notes/11111111-1111-4111-8111-111111111111', route: 'GET /notes/:id',
    queryLength: 0, querySha256: hash, at: new Date().toISOString(), policyRevision: 1,
    deviceRegistered: true, stepUp: { verified: false, authAgeSeconds: null },
    recentEvents: [], signals: { source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 },
    ...overrides,
  };
}

test('A는 자기 메모를 읽고 수정할 수 있다', async () => {
  assert.equal((await decide(request())).decision, 'allow');
  const edit = request({ method: 'PUT', route: 'PUT /notes/:id' });
  assert.equal((await decide(edit)).decision, 'allow');
});

test('B는 A 소유 메모를 읽거나 수정할 수 없다', async () => {
  const other = request({ subjectId: 'subject-B' });
  assert.equal((await decide(other)).decision, 'deny');
  const edit = request({ subjectId: 'subject-B', method: 'PUT', route: 'PUT /notes/:id' });
  assert.equal((await decide(edit)).decision, 'deny');
});

test('강사는 본인 소유 공지를 수정할 수 있고 일반 학생은 거부된다', async () => {
  const announcement = request({ service: 'announcements', method: 'PUT',
    path: '/announcements/22222222-2222-4222-8222-222222222222',
    route: 'PUT /announcements/:id', actorRole: 'instructor' });
  assert.equal((await decide(announcement)).decision, 'allow');
  assert.equal((await decide({ ...announcement, requestId: randomUUID(), actorRole: 'student' })).decision, 'deny');
});

test('쿼리 기능 선택, 알 수 없는 경로, 기능명 경로는 거부된다', async () => {
  assert.equal((await decide(request({ queryLength: 8 }))).decision, 'deny');
  assert.equal((await decide(request({ path: '/notes/export', route: 'GET /notes/:id' }))).decision, 'deny');
  assert.equal((await decide(request({ path: '/notes/11111111-1111-4111-8111-111111111111/export', route: 'GET /notes/:id' }))).decision, 'deny');
  assert.equal((await decide(request({ path: '/unknown', route: 'GET /notes/:id' }))).decision, 'deny');
});

test('the real API /api prefix is accepted without opening extra path segments', async () => {
  const ownApiPath = request({ path: '/api/notes/11111111-1111-4111-8111-111111111111' });
  assert.equal((await decide(ownApiPath)).decision, 'allow');
  const exportPath = request({ path: '/api/notes/11111111-1111-4111-8111-111111111111/export' });
  assert.equal((await decide(exportPath)).decision, 'deny');
});

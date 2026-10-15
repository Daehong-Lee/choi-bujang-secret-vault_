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
    path: '/notes/virtual-memo-1', route: 'GET /notes/:id',
    queryLength: 0, querySha256: hash, at: new Date().toISOString(), policyRevision: 1,
    deviceRegistered: true, stepUp: { verified: false, authAgeSeconds: null },
    recentEvents: [], signals: { source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 },
    ...overrides,
  };
}

test('학생 예제 계정의 개별 메모 읽기는 소유자 비교 없이 경로 규칙에서 허용된다', async () => {
  assert.equal((await decide(request())).decision, 'allow');
  const otherOwner = request({ resourceOwnerSubjectId: 'subject-B' });
  assert.equal((await decide(otherOwner)).decision, 'allow');
});

test('배포 계약의 /api 경로 별칭도 본인 메모 상세 경로로 허용한다', async () => {
  const result = await decide(request({
    path: '/api/notes/virtual-memo-1',
    route: 'GET /api/notes/:id',
  }));
  assert.equal(result.decision, 'allow');
});

test('개별 메모 수정·삭제 경로는 허용하지만 ID 없는 메모 목록은 거부한다', async () => {
  assert.equal((await decide(request({ method: 'PUT', route: 'PUT /notes/:id' }))).decision, 'allow');
  assert.equal((await decide(request({ method: 'DELETE', route: 'DELETE /notes/:id' }))).decision, 'allow');
  assert.equal((await decide(request({ path: '/notes', route: 'GET /notes' }))).decision, 'deny');
  assert.equal((await decide(request({ method: 'POST', path: '/notes', route: 'POST /notes' }))).decision, 'allow');
  assert.equal((await decide(request({ method: 'POST', path: '/notes/virtual-memo-1', route: 'POST /notes/:id' }))).decision, 'deny');
});

test('공지 조회만 허용하고 학생·강사 모두 공지 쓰기는 거부한다', async () => {
  const announcement = {
    service: 'announcements', path: '/announcements/class-note', route: 'GET /announcements/:id',
    actorRole: 'student',
  };
  assert.equal((await decide(request(announcement))).decision, 'allow');
  assert.equal((await decide(request({ service: 'announcements', path: '/announcements', route: 'GET /announcements' }))).decision, 'allow');
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const path = method === 'POST' ? '/announcements' : '/announcements/class-note';
    const route = method === 'POST' ? 'POST /announcements' : `${method} /announcements/:id`;
    for (const actorRole of ['student', 'instructor']) {
      const result = await decide(request({ service: 'announcements', method, path, route, actorRole }));
      assert.equal(result.decision, 'deny', `${actorRole} ${method} must be denied`);
    }
  }
});

test('UUID가 아닌 가상 ID는 허용하지만 export·추가 경로·쿼리 선택은 거부한다', async () => {
  assert.equal((await decide(request({ path: '/notes/judge-id-not-a-uuid' }))).decision, 'allow');
  assert.equal((await decide(request({ queryLength: 8 }))).decision, 'deny');
  assert.equal((await decide(request({ path: '/notes/virtual-memo-1?mode=export' }))).decision, 'deny');
  assert.equal((await decide(request({ path: '/notes/virtual-memo-1#export' }))).decision, 'deny');
  assert.equal((await decide(request({ path: '/notes/export' }))).decision, 'deny');
  assert.equal((await decide(request({ path: '/notes/virtual-memo-1/export' }))).decision, 'deny');
  assert.equal((await decide(request({ path: '/unknown', route: 'GET /notes/:id' }))).decision, 'deny');
  assert.equal((await decide(request({ service: 'instructor-materials', path: '/instructor-materials/handout-1', route: 'GET /instructor-materials/:id' }))).decision, 'deny');
});

test('등록되지 않은 기기는 개별 메모 경로도 거부된다', async () => {
  assert.equal((await decide(request({ deviceRegistered: false }))).decision, 'deny');
});

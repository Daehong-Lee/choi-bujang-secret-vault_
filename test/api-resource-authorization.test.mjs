import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { authorizeAnnouncementCreate, authorizeAnnouncementWrite, authorizeMemoOwner } from '../src/resource-access.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const memo = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', resource_type: 'memo', owner_id: owner };
const announcement = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', resource_type: 'announcement', owner_id: owner };

test('API helper permits only the verified owner to access a memo', () => {
  assert.deepEqual(authorizeMemoOwner({ kind: 'student', userId: owner }, memo), { allowed: true });
  assert.equal(authorizeMemoOwner({ kind: 'student', userId: other }, memo).reason, 'RESOURCE_NOT_FOUND_OR_FORBIDDEN');
  assert.equal(authorizeMemoOwner({ kind: 'student', userId: owner }, announcement).reason, 'RESOURCE_NOT_FOUND');
  assert.equal(authorizeMemoOwner(null, memo).reason, 'AUTH_REQUIRED');
});

test('API helper permits only a verified instructor who owns the announcement to modify it', () => {
  assert.deepEqual(authorizeAnnouncementWrite({ kind: 'judge', userId: owner }, announcement), { allowed: true });
  assert.equal(authorizeAnnouncementWrite({ kind: 'student', userId: owner }, announcement).reason, 'INSTRUCTOR_REQUIRED');
  assert.equal(authorizeAnnouncementWrite({ kind: 'judge', userId: other }, announcement).reason, 'RESOURCE_NOT_FOUND_OR_FORBIDDEN');
  assert.equal(authorizeAnnouncementWrite({ kind: 'judge', userId: owner }, memo).reason, 'RESOURCE_NOT_FOUND');
  assert.equal(authorizeAnnouncementCreate({ kind: 'student', userId: owner }).reason, 'INSTRUCTOR_REQUIRED');
});

test('resource APIs use verifier identity and stored resource ownership, not body role', async () => {
  const paths = ['api/notes.js', 'api/notes/[id].js', 'api/announcements.js', 'api/announcements/[id].js'];
  const source = await Promise.all(paths.map(path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));
  for (const code of source) {
    assert.match(code, /createLoginVerifier/u);
    assert.doesNotMatch(code, /input\.role|body\.role/u);
    assert.match(code, /reason: 'AUTH_REQUIRED'/u);
  }
  assert.match(source[1], /authorizeMemoOwner\(identity, existing\)/u);
  assert.match(source[3], /authorizeAnnouncementWrite\(identity, existing\)/u);
  assert.match(source[0], /owner_id: identity\.userId/u);
  assert.match(source[2], /authorizeAnnouncementCreate\(identity\)/u);
});


test('memo item API requires signed engine context while announcement writes use the separate server management path', async () => {
  const note = await readFile(new URL('../api/notes/[id].js', import.meta.url), 'utf8');
  const announcement = await readFile(new URL('../api/announcements/[id].js', import.meta.url), 'utf8');
  assert.match(note, /authorizeWithEngine/u);
  assert.match(note, /engineContextRequired/u);
  assert.match(note, /Regression fix S08_OWN_BROKEN/u);
  assert.match(note, /authorizeMemoOwner\(identity, existing\)/u);
  assert.match(announcement, /authorizeAnnouncementWrite\(identity, existing\)/u);
  assert.match(announcement, /separate server-management path/u);
  assert.doesNotMatch(announcement, /authorizeWithEngine|engineContextRequired/u);
});


test('API checks persisted resource ownership before asking the decider about the route', async () => {
  const note = await readFile(new URL('../api/notes/[id].js', import.meta.url), 'utf8');
  const announcement = await readFile(new URL('../api/announcements/[id].js', import.meta.url), 'utf8');
  const engine = await readFile(new URL('../src/engine-authorization.mjs', import.meta.url), 'utf8');
  assert.ok(note.indexOf('authorizeMemoOwner(identity, existing)') < note.indexOf('authorizeWithEngine('));
  assert.match(announcement, /authorizeAnnouncementWrite\(identity, existing\)/u);
  assert.doesNotMatch(announcement, /authorizeWithEngine|engineContextRequired/u);
  assert.doesNotMatch(engine, /ownerUserId|resourceOwnerSubjectId|RESOURCE_OWNER_MISMATCH/u);
  assert.match(note, /if \(!access\.allowed\)\s*\{[\s\S]*?return json\(res, access\.status === 401 \? 401 : 404/u);
});


test('ID-less memo collection GET is denied and Stage 8 config lists only decider-allowed routes', async () => {
  const notes = await readFile(new URL('../api/notes.js', import.meta.url), 'utf8');
  const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  const contract = await readFile(new URL('../docs/DECIDER_REQUEST.md', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(notes, /COLLECTION_ROUTE_DENIED/u);
  assert.equal(config.step, 8);
  assert.deepEqual(config.allowedRoutes, [
    'GET /api/notes/:id', 'PUT /api/notes/:id', 'DELETE /api/notes/:id',
    'GET /api/announcements', 'GET /api/announcements/:id',
  ]);
  assert.match(contract, /UUID 형식으로 제한하지 않습니다/u);
  assert.match(contract, /DB의 `owner_id`/u);
  assert.match(contract, /공지의 `POST`, `PUT`, `PATCH`, `DELETE`는 역할과 무관하게 판정기에서 모두 거부/u);
  assert.match(readme, /`step`은 8/u);
  assert.match(readme, /판정기에서 거부합니다/u);
});

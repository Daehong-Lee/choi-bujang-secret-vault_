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
  assert.match(source[0], /\.eq\('owner_id', identity\.userId\)/u);
  assert.match(source[2], /authorizeAnnouncementCreate\(identity\)/u);
});


test('item APIs restore owner self-read through a signed engine decision and require context for changes', async () => {
  const note = await readFile(new URL('../api/notes/[id].js', import.meta.url), 'utf8');
  const announcement = await readFile(new URL('../api/announcements/[id].js', import.meta.url), 'utf8');
  for (const code of [note, announcement]) {
    assert.match(code, /authorizeWithEngine/u);
    assert.match(code, /engineContextRequired/u);
  }
  assert.match(note, /Regression fix S08_OWN_BROKEN/u);
  assert.match(note, /authorizeMemoOwner\(identity, existing\)/u);
  assert.match(announcement, /authorizeAnnouncementWrite\(identity, existing\)/u);
  assert.match(announcement, /identity, service: 'announcements'/u);
});

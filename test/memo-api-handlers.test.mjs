import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createMemoApiHandlers } from '../src/memo-api-handlers.mjs';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const tokenUsers = new Map([
  ['token-a', { kind: 'student', userId: userA }], // test fixture for a@example.com's verified subject
  ['token-b', { kind: 'student', userId: userB }],
]);

function createHarness() {
  const rows = new Map();
  const store = {
    async create(row) {
      if (rows.has(row.id)) return { data: null, error: { code: '23505' } };
      rows.set(row.id, { ...row });
      return { data: { ...row }, error: null };
    },
    async findById(id) {
      const row = rows.get(id);
      return { data: row ? { ...row } : null, error: null };
    },
    async update(id, ownerId, fields) {
      const row = rows.get(id);
      if (!row || row.owner_id !== ownerId || row.resource_type !== 'memo') return { data: null, error: null };
      Object.assign(row, fields);
      return { data: { ...row }, error: null };
    },
    async delete(id, ownerId) {
      const row = rows.get(id);
      if (!row || row.owner_id !== ownerId || row.resource_type !== 'memo') return { data: null, error: null };
      rows.delete(id);
      return { data: { id }, error: null };
    },
  };
  const handlers = createMemoApiHandlers({
    verifyLoginAuthorization: async (header) => tokenUsers.get(String(header || '').replace(/^Bearer /u, '')) ?? null,
    getStore: async () => store,
    authorizeEngine: async () => ({ present: false }),
  });
  return { handlers, rows };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    setHeader(key, value) { this.headers[key] = value; },
    end(value) { this.body = value ? JSON.parse(value) : null; },
  };
}

async function call(handler, { method, url, token = 'token-a', body, id } = {}) {
  const req = { method, url, headers: { authorization: `Bearer ${token}` }, body, query: id ? { id } : {} };
  const res = response();
  await handler(req, res);
  return res;
}

test('verified a@example.com test identity can create and perform ID-specific CRUD', async () => {
  const { handlers, rows } = createHarness();
  const created = await call(handlers.collection, {
    method: 'POST', url: '/api/notes', body: { title: '실습 메모', body: '가상 내용' }
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.title, '실습 메모');
  assert.equal(created.body.body, '가상 내용');
  const id = created.body.id;
  assert.equal(rows.get(id).owner_id, userA);
  assert.equal(rows.get(id).resource_type, 'memo');

  const read = await call(handlers.item, { method: 'GET', url: `/api/notes/${id}`, id });
  assert.equal(read.statusCode, 200);
  assert.equal(read.body.id, id);

  const updated = await call(handlers.item, {
    method: 'PUT', url: `/api/notes/${id}`, id,
    body: { title: '수정된 제목', body: '수정된 내용' }
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.title, '수정된 제목');
  assert.equal(updated.body.body, '수정된 내용');

  const deleted = await call(handlers.item, { method: 'DELETE', url: `/api/notes/${id}`, id });
  assert.equal(deleted.statusCode, 204);
  const afterDelete = await call(handlers.item, { method: 'GET', url: `/api/notes/${id}`, id });
  assert.equal(afterDelete.statusCode, 404);
});

test('another verified user cannot read, update, or delete the owner memo', async () => {
  const { handlers, rows } = createHarness();
  const created = await call(handlers.collection, {
    method: 'POST', url: '/api/notes', body: { title: 'A 전용', body: '비공개 가상 내용' }
  });
  const id = created.body.id;
  assert.equal(rows.get(id).owner_id, userA);

  const read = await call(handlers.item, { method: 'GET', url: `/api/notes/${id}`, id, token: 'token-b' });
  const updated = await call(handlers.item, {
    method: 'PUT', url: `/api/notes/${id}`, id, token: 'token-b',
    body: { title: '탈취 시도', body: '변경 시도' }
  });
  const deleted = await call(handlers.item, { method: 'DELETE', url: `/api/notes/${id}`, id, token: 'token-b' });
  assert.equal(read.statusCode, 404);
  assert.equal(updated.statusCode, 404);
  assert.equal(deleted.statusCode, 404);
  assert.equal(rows.get(id).title, 'A 전용');
});

test('collection GET is denied and creation requires a verified login', async () => {
  const { handlers } = createHarness();
  const list = await call(handlers.collection, { method: 'GET', url: '/api/notes' });
  assert.equal(list.statusCode, 403);
  assert.equal(list.body.reason, 'COLLECTION_ROUTE_DENIED');

  const unauthenticated = response();
  await handlers.collection({ method: 'POST', url: '/api/notes', headers: {}, body: { title: 'x', body: 'y' } }, unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
});

test('UI separates authentication state from memo lookup and does not call collection GET', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="auth-status"/u);
  assert.match(html, /id="note-message"/u);
  assert.match(html, /\/api\/notes\/\$\{encodeURIComponent\(id\)\}/u);
  assert.doesNotMatch(html, /apiRequest\('\/api\/notes'\)/u);
  assert.match(html, /로그인하면 메모 ID로 조회/u);
});

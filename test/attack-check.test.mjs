import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = {
  step: 8,
  publicAppUrl: 'https://example-project.vercel.app/',
  sampleMarker: 'SAMPLE_NOTE_1',
};

test('stage 8 deployment self-check observes static exposure and unauthenticated API responses', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: options.method ?? 'GET' });
    if (path === '/') return new Response('<html>empty demo</html>', { status: 200 });
    if (path === '/data.json') return new Response('Not Found', { status: 404 });
    if (path === '/api/notes') return new Response('{"error":"login required"}', { status: 401 });
    if (path.startsWith('/api/notes/')) return new Response('{"error":"login required"}', { status: 401 });
    if (path === '/api/announcements') return new Response('{"error":"login required"}', { status: 401 });
    return new Response('Not Found', { status: 404 });
  };
  const result = await runAttackChecks(config, fakeFetch);
  assert.equal(result.length, 6);
  assert.ok(result.every((item) => Object.keys(item).sort().join(',') === 'attackId,expected,observed'));
  assert.ok(result.every((item) => !/확인 필요/u.test(item.observed)));
  assert.ok(calls.some((item) => item.path === '/api/notes' && item.method === 'POST'));
  assert.ok(calls.some((item) => item.path === '/api/announcements'));
});

test('stage 1 self-check still verifies the configured virtual sample marker', async () => {
  const result = await runAttackChecks({ ...config, step: 1 }, async () => new Response(
    JSON.stringify({ sampleMarker: 'SAMPLE_NOTE_1', notes: [{ title: 'virtual' }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
  assert.equal(result.length, 1);
  assert.match(result[0].observed, /확인 표시가 보임/u);
});

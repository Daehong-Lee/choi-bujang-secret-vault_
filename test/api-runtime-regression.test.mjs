import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { databaseFailureReason } from '../src/database-errors.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('database errors become safe, stable reason codes without exposing raw server details', () => {
  assert.equal(databaseFailureReason({ code: '42501', message: 'permission denied on table' }), 'DATABASE_PERMISSION_DENIED');
  assert.equal(databaseFailureReason({ code: '42P01' }), 'DATABASE_TABLE_MISSING');
  assert.equal(databaseFailureReason({ code: 'PGRST205' }), 'DATABASE_TABLE_MISSING');
  assert.equal(databaseFailureReason({ code: '42703' }), 'DATABASE_COLUMN_MISSING');
  assert.equal(databaseFailureReason({ code: 'PGRST204' }), 'DATABASE_COLUMN_MISSING');
  assert.equal(databaseFailureReason({ code: 'PGRST301' }), 'DATABASE_API_KEY_REJECTED');
  assert.equal(databaseFailureReason({ code: '23514' }), 'DATABASE_CONSTRAINT_FAILED');
  assert.equal(databaseFailureReason({ code: 'unknown', message: 'secret-bearing raw error' }), 'DATABASE_OPERATION_FAILED');
});

test('server initialization errors are deferred into JSON responses instead of crashing module startup', async () => {
  const runtime = await read('src/api-runtime.mjs');
  assert.match(runtime, /SUPABASE_URL_MISSING/u);
  assert.match(runtime, /SUPABASE_SECRET_KEY_MISSING/u);
  assert.match(runtime, /SUPABASE_URL_ISSUER_MISMATCH/u);
  assert.match(runtime, /respondRuntimeError/u);
  assert.doesNotMatch(runtime, /console\.(?:log|error).*supabaseSecretKey/u);
  for (const route of ['api/notes.js', 'api/notes/[id].js', 'api/announcements.js', 'api/announcements/[id].js']) {
    const source = await read(route);
    assert.match(source, /getApiRuntime\(\)/u, route);
    assert.match(source, /respondRuntimeError\(res, error\)/u, route);
    assert.doesNotMatch(source, /const supabaseSecretKey = process\.env/u, route);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authConfig = await readFile(new URL('../public/auth-config.js', import.meta.url), 'utf8');
const authScript = await readFile(new URL('../public/auth.js', import.meta.url), 'utf8');
const indexHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('Supabase browser configuration uses unwrapped values', () => {
  assert.match(authConfig, /SUPABASE_URL\s*=\s*'https:\/\//);
  assert.match(authConfig, /SUPABASE_PUBLISHABLE_KEY\s*=\s*'sb_publishable_/);
  assert.doesNotMatch(authConfig, /SUPABASE_(?:URL|PUBLISHABLE_KEY)\s*=\s*'\[/);
  assert.doesNotMatch(authConfig, /SUPABASE_SECRET_KEY|service_role/i);
});

test('misformatted Supabase config is reported in the login panel', () => {
  assert.match(authScript, /SUPABASE_URL\.startsWith\('\['\)/);
  assert.match(authScript, /Supabase 설정 오류/);
});

test('deployed UI uses item IDs and does not request the forbidden memo list', () => {
  assert.match(indexHtml, /vault-build-id" content="login-id-crud-fix-2026-10-14/);
  assert.match(indexHtml, /apiRequest\(`\/api\/notes\/\$\{encodeURIComponent\(id\)\}`\)/);
  assert.doesNotMatch(indexHtml, /apiRequest\(['"]\/api\/notes['"]\s*\)/);
  assert.doesNotMatch(indexHtml, /fetch\(['"]\/api\/notes['"]\s*\)/);
});

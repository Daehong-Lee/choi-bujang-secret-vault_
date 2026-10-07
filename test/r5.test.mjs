import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const config = {
  step: 1,
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1',
  publicAppUrl: 'https://student-defense.vercel.app',
};
const env = {
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'Student-A',
  VERCEL_GIT_REPO_SLUG: 'aleph-defense',
  VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
  VERCEL_URL: 'student-defense-123.vercel.app',
};

test('build identity uses Vercel Git and deployment metadata', () => {
  assert.deepEqual(deploymentIdentity(env, config), {
    schema: 'aleph.defense.deployment.v1',
    step: 1,
    repoUrl: 'https://github.com/student-a/aleph-defense',
    commit: 'a'.repeat(40),
    publicAppUrl: 'https://student-defense-123.vercel.app',
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
  });
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_PROVIDER: undefined }, config));
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_COMMIT_SHA: 'short' }, config));
});

test('source data remains in repository but is not part of static output', async () => {
  const source = JSON.parse(await readFile(resolve(root, 'data.json'), 'utf8'));
  assert.equal(Array.isArray(source.notes), true);
  assert.equal(source.notes.length, 4);
  await assert.rejects(readFile(resolve(root, 'public', 'data.json'), 'utf8'));
});

test('public page no longer requests the static data file', async () => {
  const html = await readFile(resolve(root, 'public', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /fetch\(['"]\/data\.json['"]/u);
  assert.match(html, /자료 보호 적용됨/u);
});

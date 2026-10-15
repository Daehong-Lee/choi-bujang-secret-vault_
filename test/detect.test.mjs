import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detect } from '../src/detect.mjs';

const START = Date.UTC(2026, 9, 1, 0, 0, 0);
function reads(count, { intervalSeconds = 2, owner = 'learner_fixture', method = 'GET', start = START } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    at: new Date(start + index * intervalSeconds * 1000).toISOString(),
    method, identity: { sub: owner },
  }));
}

test('detect revocation proposal is only returned above 120 reads in a rolling ten-minute window', () => {
  assert.deepEqual(detect(reads(30)), { action: 'observe' });
  assert.deepEqual(detect(reads(120)), { action: 'observe' });
  assert.deepEqual(detect(reads(121)), {
    action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_fixture',
  });
});

test('detect keeps users and non-GET requests separate', () => {
  assert.deepEqual(detect([...reads(100), ...reads(100, { owner: 'other_fixture' })]), { action: 'observe' });
  assert.deepEqual(detect(reads(150, { method: 'POST' })), { action: 'observe' });
});

test('detect does not combine reads outside a ten-minute rolling window', () => {
  assert.deepEqual(detect(reads(200, { intervalSeconds: 7 })), { action: 'observe' });
});

test('detect rejects a non-array event input and ignores malformed events', () => {
  assert.throws(() => detect({}), { name: 'TypeError', message: 'invalid_detection_events' });
  assert.deepEqual(detect([{ at: 'not-a-date', method: 'GET', identity: { sub: 'x' } }]), { action: 'observe' });
});

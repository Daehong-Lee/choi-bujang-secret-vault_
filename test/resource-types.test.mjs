import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('메모와 공지는 같은 UUID 공간에서 resource_type으로 분리되고 기존 메모 주소는 유지된다', async () => {
  const migration = await read('supabase/migrate_virtual_notes.sql');
  const notes = await read('api/notes.js');
  const noteById = await read('api/notes/[id].js');
  const announcements = await read('api/announcements.js');
  const announcementById = await read('api/announcements/[id].js');

  assert.match(migration, /resource_type text not null default 'memo'/u);
  assert.match(migration, /check \(resource_type in \('memo', 'announcement'\)\)/u);
  const memoHandlers = await read('src/memo-api-handlers.mjs');
  assert.match(memoHandlers, /reason: 'COLLECTION_ROUTE_DENIED'/u);
  assert.match(memoHandlers, /resource_type: 'memo'/u);
  assert.match(noteById, /\.eq\('resource_type', 'memo'\)/u);
  assert.match(announcements, /\.eq\('resource_type', 'announcement'\)/u);
  assert.match(announcements, /resource_type: 'announcement'/u);
  assert.match(announcementById, /\.eq\('resource_type', 'announcement'\)/u);
  assert.match(announcementById, /identity\.kind !== 'judge'/u);
  assert.match(await read('src/memo-api-handlers.mjs'), /resourceType: note\.resource_type/u);
  assert.match(announcements, /resourceType: note\.resource_type/u);
});

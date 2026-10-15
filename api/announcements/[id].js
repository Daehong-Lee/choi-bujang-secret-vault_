import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLoginVerifier } from '../../src/verify-login.mjs';
import { createClient } from '@supabase/supabase-js';
import { authorizeAnnouncementWrite } from '../../src/resource-access.mjs';

const root = process.cwd();
const config = JSON.parse(await readFile(join(root, 'aleph.config.json'), 'utf8'));
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const verifyLoginAuthorization = createLoginVerifier({ config, supabaseSecretKey });

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return {};
}

function validUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

function noteView(note) {
  return { id: note.id, resourceType: note.resource_type ?? 'memo', title: note.title, body: note.body };
}

export default async function handler(req, res) {
  if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PUT, DELETE');
    return json(res, 405, { error: 'Method Not Allowed', reason: 'METHOD_NOT_ALLOWED' });
  }
  const identity = await verifyLoginAuthorization(req.headers.authorization);
  if (!identity?.userId) return json(res, 401, { error: '로그인이 필요합니다.', reason: 'AUTH_REQUIRED' });
  const id = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
  if (!validUuid(id)) return json(res, 400, { error: 'id는 UUID여야 합니다.', reason: 'INVALID_RESOURCE_ID' });

  try {
    const supabase = createClient(process.env.SUPABASE_URL, supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: existing, error: lookupError } = await supabase.from('learning_notes')
      .select('id, resource_type, title, body, owner_id').eq('id', id).maybeSingle();
    if (lookupError) return json(res, 500, { error: '강사 공지를 확인하지 못했습니다.', reason: 'RESOURCE_LOOKUP_FAILED' });

    if (req.method === 'GET') {
      if (!existing || existing.resource_type !== 'announcement') return json(res, 404, { error: '강사 공지를 찾을 수 없습니다.', reason: 'RESOURCE_NOT_FOUND' });
      return json(res, 200, noteView(existing));
    }

    // Announcement writes are intentionally not allowed by the decider.
    // This separate server-management path requires a verified judge identity
    // and checks the persisted resource type/owner before any mutation.
    if (identity.kind !== 'judge') return json(res, 403, { error: '강사 공지는 강사 권한으로만 수정할 수 있습니다.', reason: 'INSTRUCTOR_REQUIRED' });
    const access = authorizeAnnouncementWrite(identity, existing);
    if (!access.allowed) return json(res, access.status, { error: '강사 공지를 수정할 수 없습니다.', reason: access.reason });

    if (req.method === 'PUT') {
      const input = parseBody(req);
      if (typeof input.title !== 'string' || !input.title.trim()) return json(res, 400, { error: 'title이 필요합니다.' });
      if (typeof input.body !== 'string') return json(res, 400, { error: 'body가 필요합니다.' });
      const { data, error } = await supabase.from('learning_notes').update({
        title: input.title, body: input.body,
      }).eq('id', id).eq('resource_type', 'announcement').eq('owner_id', identity.userId)
        .select('id, resource_type, title, body, owner_id').maybeSingle();
      if (error) return json(res, 500, { error: '강사 공지를 수정하지 못했습니다.', reason: 'RESOURCE_UPDATE_FAILED' });
      if (!data || data.owner_id !== identity.userId || data.resource_type !== 'announcement') {
        return json(res, 404, { error: '강사 공지를 찾을 수 없습니다.', reason: 'RESOURCE_NOT_FOUND_OR_FORBIDDEN' });
      }
      return json(res, 200, noteView(data));
    }

    const { data, error } = await supabase.from('learning_notes').delete()
      .eq('id', id).eq('resource_type', 'announcement').eq('owner_id', identity.userId)
      .select('id').maybeSingle();
    if (error) return json(res, 500, { error: '강사 공지를 삭제하지 못했습니다.', reason: 'RESOURCE_DELETE_FAILED' });
    if (!data) return json(res, 404, { error: '강사 공지를 찾을 수 없습니다.', reason: 'RESOURCE_NOT_FOUND_OR_FORBIDDEN' });
    return res.status(204).end();
  } catch (error) {
    if (error instanceof SyntaxError) return json(res, 400, { error: 'JSON 형식이 올바르지 않습니다.' });
    return json(res, 500, { error: '자료를 처리하지 못했습니다.' });
  }
}

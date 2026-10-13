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
    return json(res, 405, { error: 'Method Not Allowed' });
  }

  const identity = await verifyLoginAuthorization(req.headers.authorization);
  if (!identity?.userId) {
    return json(res, 401, { error: '로그인이 필요합니다.', reason: 'AUTH_REQUIRED' });
  }

  const id = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
  if (!validUuid(id)) return json(res, 400, { error: 'id는 UUID여야 합니다.' });

  try {
    const supabase = createClient(process.env.SUPABASE_URL, supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('learning_notes')
        .select('id, resource_type, title, body, owner_id')
        .eq('id', id)
        .eq('resource_type', 'announcement')
        .maybeSingle();

      if (error) return json(res, 500, { error: '강사 공지를 불러오지 못했습니다.', reason: 'RESOURCE_READ_FAILED' });
      if (!data) return json(res, 404, { error: '강사 공지를 찾을 수 없습니다.', reason: 'RESOURCE_NOT_FOUND' });
      return json(res, 200, noteView(data));
    }

    if (req.method === 'PUT') {
      if (identity.kind !== 'judge') return json(res, 403, { error: '강사 권한이 필요합니다.', reason: 'INSTRUCTOR_REQUIRED' });
      const input = parseBody(req);
      if (typeof input.title !== 'string' || !input.title.trim()) {
        return json(res, 400, { error: 'title이 필요합니다.' });
      }
      if (typeof input.body !== 'string') {
        return json(res, 400, { error: 'body가 필요합니다.' });
      }

      const { data: existing, error: existingError } = await supabase
        .from('learning_notes')
        .select('id, resource_type, owner_id')
        .eq('id', id)
        .maybeSingle();

      if (existingError) return json(res, 500, { error: '자료 소유자를 확인하지 못했습니다.', reason: 'OWNER_CHECK_FAILED' });
      const access = authorizeAnnouncementWrite(identity, existing);
      if (!access.allowed) return json(res, access.status, { error: '강사 공지를 찾을 수 없습니다.', reason: access.reason });

      const { data, error } = await supabase
        .from('learning_notes')
        .update({
          title: input.title,
          body: input.body
        })
        .eq('id', id)
        .eq('owner_id', identity.userId)
        .select('id, resource_type, title, body, owner_id')
        .eq('resource_type', 'announcement')
        .maybeSingle();

      if (error) return json(res, 500, { error: '강사 공지를 수정하지 못했습니다.', reason: 'RESOURCE_UPDATE_FAILED' });
      const updatedAccess = authorizeAnnouncementWrite(identity, data);
      if (!updatedAccess.allowed) return json(res, updatedAccess.status, { error: '강사 공지를 찾을 수 없습니다.', reason: updatedAccess.reason });
      return json(res, 200, noteView(data));
    }

    if (identity.kind !== 'judge') return json(res, 403, { error: '강사 권한이 필요합니다.', reason: 'INSTRUCTOR_REQUIRED' });

    const { data, error } = await supabase
      .from('learning_notes')
      .delete()
      .eq('id', id)
      .eq('resource_type', 'announcement')
      .eq('owner_id', identity.userId)
      .select('id')
      .maybeSingle();

    if (error) return json(res, 500, { error: '강사 공지를 삭제하지 못했습니다.', reason: 'RESOURCE_DELETE_FAILED' });
    if (!data) return json(res, 404, { error: '강사 공지를 찾을 수 없습니다.', reason: 'RESOURCE_NOT_FOUND_OR_FORBIDDEN' });
    return res.status(204).end();
  } catch (error) {
    if (error instanceof SyntaxError) return json(res, 400, { error: 'JSON 형식이 올바르지 않습니다.' });
    return json(res, 500, { error: '자료를 처리하지 못했습니다.' });
  }
}

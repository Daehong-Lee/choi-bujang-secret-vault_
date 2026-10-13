import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { createClient } from '@supabase/supabase-js';
import { authorizeAnnouncementCreate } from '../src/resource-access.mjs';

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
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  }

  const identity = await verifyLoginAuthorization(req.headers.authorization);
  if (!identity?.userId) {
    return json(res, 401, { error: '로그인이 필요합니다.', reason: 'AUTH_REQUIRED' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('learning_notes')
        .select('id, resource_type, title, body')
        .eq('resource_type', 'announcement')
        .order('id', { ascending: true });

      if (error) return json(res, 500, { error: '강사 공지를 불러오지 못했습니다.' });
      return json(res, 200, (data ?? []).map(noteView));
    }

    const createAccess = authorizeAnnouncementCreate(identity);
    if (!createAccess.allowed) return json(res, createAccess.status, { error: '강사 권한이 필요합니다.', reason: createAccess.reason });

    const input = parseBody(req);
    const id = input.id == null || input.id === '' ? crypto.randomUUID() : input.id;
    if (!validUuid(id)) return json(res, 400, { error: 'id는 UUID여야 합니다.' });
    if (typeof input.title !== 'string' || !input.title.trim()) {
      return json(res, 400, { error: 'title이 필요합니다.' });
    }
    if (typeof input.body !== 'string') {
      return json(res, 400, { error: 'body가 필요합니다.' });
    }

    const { error } = await supabase.from('learning_notes').insert({
      id,
      resource_type: 'announcement',
      owner_id: identity.userId,
      title: input.title,
      body: input.body
    });

    if (error) {
      if (error.code === '23505') return json(res, 409, { error: '이미 존재하는 id입니다.' });
      return json(res, 500, { error: '강사 공지를 등록하지 못했습니다.' });
    }

    return json(res, 201, { id, resourceType: 'announcement' });
  } catch (error) {
    if (error instanceof SyntaxError) return json(res, 400, { error: 'JSON 형식이 올바르지 않습니다.' });
    return json(res, 500, { error: '자료를 처리하지 못했습니다.' });
  }
}

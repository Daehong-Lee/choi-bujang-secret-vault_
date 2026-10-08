import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLoginVerifier } from '../../src/verify-login.mjs';
import { createClient } from '@supabase/supabase-js';

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
  return { id: note.id, title: note.title, body: note.body };
}

export default async function handler(req, res) {
  if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PUT, DELETE');
    return json(res, 405, { error: 'Method Not Allowed' });
  }

  const identity = await verifyLoginAuthorization(req.headers.authorization);
  if (!identity?.userId) {
    return json(res, 401, { error: '로그인이 필요하거나 로그인 검증에 실패했습니다.' });
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
        .select('id, title, body')
        .eq('id', id)
        .maybeSingle();

      if (error) return json(res, 500, { error: '자료를 불러오지 못했습니다.' });
      if (!data) return json(res, 404, { error: '자료를 찾을 수 없습니다.' });
      return json(res, 200, noteView(data));
    }

    if (req.method === 'PUT') {
      const input = parseBody(req);
      if (typeof input.title !== 'string' || !input.title.trim()) {
        return json(res, 400, { error: 'title이 필요합니다.' });
      }
      if (typeof input.body !== 'string') {
        return json(res, 400, { error: 'body가 필요합니다.' });
      }

      // 3단계에서는 로그인만 확인하고 owner_id를 조건으로 쓰지 않습니다.
      // 다른 사용자의 id를 알고 있으면 수정할 수 있으며, 이 허점은 4단계에서 보완합니다.
      const { data, error } = await supabase
        .from('learning_notes')
        .update({ title: input.title, body: input.body })
        .eq('id', id)
        .select('id, title, body')
        .maybeSingle();

      if (error) return json(res, 500, { error: '자료를 수정하지 못했습니다.' });
      if (!data) return json(res, 404, { error: '자료를 찾을 수 없습니다.' });
      return json(res, 200, noteView(data));
    }

    const { data, error } = await supabase
      .from('learning_notes')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) return json(res, 500, { error: '자료를 삭제하지 못했습니다.' });
    if (!data) return json(res, 404, { error: '자료를 찾을 수 없습니다.' });
    return res.status(204).end();
  } catch (error) {
    if (error instanceof SyntaxError) return json(res, 400, { error: 'JSON 형식이 올바르지 않습니다.' });
    return json(res, 500, { error: '자료를 처리하지 못했습니다.' });
  }
}

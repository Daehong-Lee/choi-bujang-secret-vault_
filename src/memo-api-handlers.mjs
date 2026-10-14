import { authorizeMemoOwner } from './resource-access.mjs';

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

export function createMemoApiHandlers({ verifyLoginAuthorization, getStore, authorizeEngine }) {
  async function getIdentity(req, res) {
    const identity = await verifyLoginAuthorization(req.headers?.authorization);
    if (!identity?.userId) {
      json(res, 401, { error: '로그인이 필요합니다.', reason: 'AUTH_REQUIRED' });
      return null;
    }
    return identity;
  }

  async function collection(req, res) {
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return json(res, 405, { error: 'Method Not Allowed', reason: 'METHOD_NOT_ALLOWED' });
    }
    const identity = await getIdentity(req, res);
    if (!identity) return;

    // Listing is deliberately denied. Creation remains available to any verified
    // student identity; owner_id is derived only from the verified access token.
    if (req.method === 'GET') {
      return json(res, 403, {
        error: '메모 목록 경로는 허용되지 않습니다. 메모 ID를 지정해 주세요.',
        reason: 'COLLECTION_ROUTE_DENIED'
      });
    }

    try {
      const input = parseBody(req);
      const id = input.id == null || input.id === '' ? crypto.randomUUID() : input.id;
      if (!validUuid(id)) return json(res, 400, { error: 'id는 UUID여야 합니다.', reason: 'INVALID_RESOURCE_ID' });
      if (typeof input.title !== 'string' || !input.title.trim()) {
        return json(res, 400, { error: 'title이 필요합니다.', reason: 'TITLE_REQUIRED' });
      }
      if (typeof input.body !== 'string') {
        return json(res, 400, { error: 'body가 필요합니다.', reason: 'BODY_REQUIRED' });
      }

      const { data, error } = await (await getStore()).create({
        id, resource_type: 'memo', owner_id: identity.userId,
        title: input.title.trim(), body: input.body
      });
      if (error) {
        if (error.code === '23505') return json(res, 409, { error: '이미 존재하는 id입니다.', reason: 'RESOURCE_ID_CONFLICT' });
        return json(res, 500, { error: '자료를 추가하지 못했습니다.', reason: 'RESOURCE_CREATE_FAILED' });
      }
      if (!data) return json(res, 500, { error: '추가 결과를 확인하지 못했습니다.', reason: 'RESOURCE_CREATE_UNCONFIRMED' });
      return json(res, 201, noteView(data));
    } catch (error) {
      if (error instanceof SyntaxError) return json(res, 400, { error: 'JSON 형식이 올바르지 않습니다.' });
      return json(res, 500, { error: '자료를 처리하지 못했습니다.' });
    }
  }

  async function item(req, res) {
    if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'GET, PUT, DELETE');
      return json(res, 405, { error: 'Method Not Allowed', reason: 'METHOD_NOT_ALLOWED' });
    }
    const identity = await getIdentity(req, res);
    if (!identity) return;
    const id = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
    if (!validUuid(id)) return json(res, 400, { error: 'id는 UUID여야 합니다.', reason: 'INVALID_RESOURCE_ID' });

    try {
      const store = await getStore();
      const { data: existing, error: lookupError } = await store.findById(id);
      if (lookupError) return json(res, 500, { error: '자료를 확인하지 못했습니다.', reason: 'RESOURCE_LOOKUP_FAILED' });
      const access = authorizeMemoOwner(identity, existing);
      if (!access.allowed) {
        return json(res, access.status === 401 ? 401 : 404,
          { error: '자료를 찾을 수 없습니다.', reason: access.reason });
      }

      // The browser cannot mint a signed engine envelope. If a trusted engine
      // context is supplied, it is an additional gate; persisted ownership is
      // always checked here before any content is returned or changed.
      if (authorizeEngine) {
        const engine = await authorizeEngine({ req, identity, service: 'notes', id });
        if (engine.present && !engine.allowed) {
          return json(res, engine.status, {
            error: req.method === 'GET' ? '자료 접근이 거부되었습니다.' : '자료 변경이 거부되었습니다.',
            reason: engine.reason
          });
        }
      }

      if (req.method === 'GET') return json(res, 200, noteView(existing));

      if (req.method === 'PUT') {
        const input = parseBody(req);
        if (typeof input.title !== 'string' || !input.title.trim()) {
          return json(res, 400, { error: 'title이 필요합니다.', reason: 'TITLE_REQUIRED' });
        }
        if (typeof input.body !== 'string') {
          return json(res, 400, { error: 'body가 필요합니다.', reason: 'BODY_REQUIRED' });
        }
        const { data, error } = await store.update(id, identity.userId, {
          title: input.title.trim(), body: input.body
        });
        if (error) return json(res, 500, { error: '자료를 수정하지 못했습니다.', reason: 'RESOURCE_UPDATE_FAILED' });
        const updatedAccess = authorizeMemoOwner(identity, data);
        if (!updatedAccess.allowed) return json(res, 404, { error: '자료를 찾을 수 없습니다.', reason: updatedAccess.reason });
        return json(res, 200, noteView(data));
      }

      const { data, error } = await store.delete(id, identity.userId);
      if (error) return json(res, 500, { error: '자료를 삭제하지 못했습니다.', reason: 'RESOURCE_DELETE_FAILED' });
      if (!data) return json(res, 404, { error: '자료를 찾을 수 없습니다.', reason: 'RESOURCE_NOT_FOUND_OR_FORBIDDEN' });
      return res.status(204).end();
    } catch (error) {
      if (error instanceof SyntaxError) return json(res, 400, { error: 'JSON 형식이 올바르지 않습니다.' });
      return json(res, 500, { error: '자료를 처리하지 못했습니다.' });
    }
  }

  return { collection, item };
}

import { createMemoApiHandlers } from '../../src/memo-api-handlers.mjs';
import { authorizeWithEngine } from '../../src/engine-authorization.mjs';
import { databaseFailureReason } from '../../src/database-errors.mjs';
import { getApiRuntime, respondRuntimeError } from '../../src/api-runtime.mjs';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function createHandlers(runtime) {
  async function getStore() {
    const supabase = runtime.createSupabase();
    return {
      findById: (id) => supabase.from('learning_notes')
        .select('id, resource_type, title, body, owner_id').eq('id', id).maybeSingle(),
      update: (id, ownerId, fields) => supabase.from('learning_notes').update(fields)
        .eq('id', id).eq('resource_type', 'memo').eq('owner_id', ownerId)
        .select('id, resource_type, title, body, owner_id').maybeSingle(),
      delete: (id, ownerId) => supabase.from('learning_notes').delete()
        .eq('id', id).eq('resource_type', 'memo').eq('owner_id', ownerId)
        .select('id').maybeSingle(),
    };
  }
  return createMemoApiHandlers({
    verifyLoginAuthorization: runtime.verifyLoginAuthorization,
    getStore,
    authorizeEngine: authorizeWithEngine,
    databaseFailureReason,
  });
}

export default async function handler(req, res) {
  try {
    const runtime = await getApiRuntime();
    return await createHandlers(runtime).item(req, res);
  } catch (error) {
    return respondRuntimeError(res, error);
  }
}

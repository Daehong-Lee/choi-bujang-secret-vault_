import { createMemoApiHandlers } from '../src/memo-api-handlers.mjs';
import { authorizeWithEngine } from '../src/engine-authorization.mjs';
import { databaseFailureReason } from '../src/database-errors.mjs';
import { getApiRuntime, respondRuntimeError } from '../src/api-runtime.mjs';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function createHandlers(runtime) {
  async function getStore() {
    const supabase = runtime.createSupabase();
    return {
      create: (row) => supabase.from('learning_notes').insert(row)
        .select('id, resource_type, title, body, owner_id').single(),
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
    return await createHandlers(runtime).collection(req, res);
  } catch (error) {
    return respondRuntimeError(res, error);
  }
}

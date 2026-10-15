import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../../src/verify-login.mjs';
import { createMemoApiHandlers } from '../../src/memo-api-handlers.mjs';
import { authorizeWithEngine } from '../../src/engine-authorization.mjs';

const root = process.cwd();
const config = JSON.parse(await readFile(join(root, 'aleph.config.json'), 'utf8'));
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const verifyLoginAuthorization = createLoginVerifier({ config, supabaseSecretKey });

async function getStore() {
  const supabase = createClient(process.env.SUPABASE_URL, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
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

const handlers = createMemoApiHandlers({ verifyLoginAuthorization, getStore, authorizeEngine: authorizeWithEngine });
export default handlers.item;

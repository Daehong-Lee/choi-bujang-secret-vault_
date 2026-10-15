import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { createMemoApiHandlers } from '../src/memo-api-handlers.mjs';
import { authorizeWithEngine } from '../src/engine-authorization.mjs';

const root = process.cwd();
const config = JSON.parse(await readFile(join(root, 'aleph.config.json'), 'utf8'));
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const verifyLoginAuthorization = createLoginVerifier({ config, supabaseSecretKey });

async function getStore() {
  const supabase = createClient(process.env.SUPABASE_URL, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return {
    create: (row) => supabase.from('learning_notes').insert(row)
      .select('id, resource_type, title, body, owner_id').single(),
  };
}

const handlers = createMemoApiHandlers({ verifyLoginAuthorization, getStore, authorizeEngine: authorizeWithEngine });
export default handlers.collection;

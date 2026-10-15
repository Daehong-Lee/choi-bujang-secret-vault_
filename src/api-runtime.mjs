import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';

const root = process.cwd();
let runtimePromise;

export class ApiRuntimeError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.name = 'ApiRuntimeError';
    this.code = code;
    this.status = status;
  }
}

async function initializeRuntime() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (typeof supabaseUrl !== 'string' || !supabaseUrl.trim()) {
    throw new ApiRuntimeError('SUPABASE_URL_MISSING');
  }
  if (typeof supabaseSecretKey !== 'string' || !supabaseSecretKey.trim()) {
    throw new ApiRuntimeError('SUPABASE_SECRET_KEY_MISSING');
  }
  if (supabaseUrl !== supabaseUrl.trim() || supabaseSecretKey !== supabaseSecretKey.trim()) {
    throw new ApiRuntimeError('SUPABASE_ENV_FORMAT_INVALID');
  }

  let parsedUrl;
  try { parsedUrl = new URL(supabaseUrl); }
  catch { throw new ApiRuntimeError('SUPABASE_URL_INVALID'); }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password
      || parsedUrl.port || parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash) {
    throw new ApiRuntimeError('SUPABASE_URL_INVALID');
  }

  let config;
  try {
    config = JSON.parse(await readFile(join(root, 'aleph.config.json'), 'utf8'));
  } catch {
    throw new ApiRuntimeError('APP_CONFIG_UNAVAILABLE');
  }
  let issuerOrigin;
  try { issuerOrigin = new URL(config?.identityProvider?.issuer).origin; }
  catch { throw new ApiRuntimeError('IDENTITY_PROVIDER_CONFIG_INVALID'); }
  if (issuerOrigin !== parsedUrl.origin) {
    throw new ApiRuntimeError('SUPABASE_URL_ISSUER_MISMATCH');
  }

  let verifyLoginAuthorization;
  try {
    verifyLoginAuthorization = createLoginVerifier({ config, supabaseSecretKey });
  } catch {
    throw new ApiRuntimeError('LOGIN_VERIFIER_CONFIGURATION_INVALID');
  }

  return {
    config,
    verifyLoginAuthorization,
    createSupabase: () => createClient(supabaseUrl, supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    }),
  };
}

export async function getApiRuntime() {
  if (!runtimePromise) {
    runtimePromise = initializeRuntime().catch((error) => {
      runtimePromise = undefined;
      if (error instanceof ApiRuntimeError) throw error;
      throw new ApiRuntimeError('API_INITIALIZATION_FAILED');
    });
  }
  return runtimePromise;
}

export function respondRuntimeError(res, error) {
  const status = error instanceof ApiRuntimeError ? error.status : 503;
  const reason = error instanceof ApiRuntimeError ? error.code : 'API_INITIALIZATION_FAILED';
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error: '서버 설정을 확인할 수 없습니다.', reason }));
}


import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method Not Allowed' });
  }

  if (!supabaseUrl || !supabaseSecretKey) {
    return json(res, 500, { error: 'Server configuration is incomplete.' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data, error } = await supabase
      .from('learning_notes')
      .select('id, owner_id, title, content')
      .order('id', { ascending: true });

    if (error) {
      return json(res, 500, { error: '자료를 불러오지 못했습니다.' });
    }

    return json(res, 200, { notes: data ?? [] });
  } catch {
    return json(res, 500, { error: '자료를 불러오지 못했습니다.' });
  }
}

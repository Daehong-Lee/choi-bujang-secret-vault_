// Step 11 self-checks use only public deployment responses and never return secrets.
async function publicFetch(url, init) {
  try {
    const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
    return { response, text: await response.text(), error: null };
  } catch (error) {
    return { response: null, text: '', error: error?.message || 'fetch failed' };
  }
}

export async function runAttackChecks(config) {
  if (config.step < 11) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try { app = new URL(config.publicAppUrl); }
  catch { throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.'); }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }

  const manifest = await publicFetch(new URL('/manifest.webmanifest', app));
  const manifestOk = Boolean(manifest.response?.ok && /BYTE BACK 내 자료실/u.test(manifest.text)
    && /standalone/u.test(manifest.text));

  const protectedNotes = await publicFetch(new URL('/api/notes', app), { method: 'GET' });
  const protectedDenied = Boolean(protectedNotes.response?.status === 401
    && /로그인이 필요합니다|AUTH_REQUIRED/u.test(protectedNotes.text));

  const observed = (check, result) => {
    if (result.error) return `${check} 요청 실패: ${result.error}`;
    return result;
  };
  return [
    { attackId: 'anonymous_protected_notes', expected: '비로그인 자료 API가 거부됨',
      observed: 'not_run: 심판 기록에 실제 요청이 없어 실행하지 않음' },
    { attackId: 'anonymous_device_approval', expected: '비로그인 기기 승인 요청이 거부되어야 함',
      observed: 'not_run: 격리 환경에서 쓰기 요청(POST)은 실행하지 않음' },
    { attackId: 'pwa_manifest_only', expected: '설치형 manifest가 있지만 설치 표시만으로 자료 접근이 허용되지 않음',
      observed: 'not_run: 심판 기록에 실제 요청이 없어 실행하지 않음' },
  ];
}

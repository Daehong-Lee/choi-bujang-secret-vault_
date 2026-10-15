// Deployment self-check only records actual HTTP observations. It is not a judge score.
const SAMPLE_TEXT = [
  '실습용 가상 과제 기록',
  '실습용 가상 포트폴리오 기록',
  '실습용 가상 리추얼 기록',
  '실습용 가상 행정 기록',
];

function deploymentUrl(config) {
  let app;
  try { app = new URL(config.publicAppUrl); }
  catch { throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.'); }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  return app;
}

async function request(fetchImpl, app, path, options = {}) {
  return fetchImpl(new URL(path, app), {
    redirect: 'error', signal: AbortSignal.timeout(10000), ...options,
  });
}

function observation(attackId, expected, observed) {
  return { attackId, expected, observed: String(observed).slice(0, 300) };
}

export async function runAttackChecks(config, fetchImpl = fetch) {
  const app = deploymentUrl(config);
  if (config.step === 1) {
    if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) {
      throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
    }
    const response = await request(fetchImpl, app, '/data.json');
    let visible = false;
    if (response.ok) {
      try {
        const data = await response.json();
        visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
          && data.notes.length > 0;
      } catch { /* A non-JSON response is a failed check. */ }
    }
    return [observation('anonymous_note_read', '비로그인 화면에서 가상 메모를 확인',
      visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})`)];
  }

  const results = [];
  const [rootResponse, dataResponse] = await Promise.all([
    request(fetchImpl, app, '/'), request(fetchImpl, app, '/data.json'),
  ]);
  const rootHtml = await rootResponse.text().catch(() => '');
  const dataBody = await dataResponse.text().catch(() => '');
  const rootLeaksSamples = SAMPLE_TEXT.some((sample) => rootHtml.includes(sample));
  const dataLeaksSamples = SAMPLE_TEXT.some((sample) => dataBody.includes(sample));
  results.push(observation('static_page_no_sample_data', '정적 HTML에 가상 메모 본문이 포함되지 않음',
    rootResponse.ok && !rootLeaksSamples ? `HTTP ${rootResponse.status}; 가상 메모 본문 미검출` : `확인 필요: HTTP ${rootResponse.status}; 본문 노출 여부 ${rootLeaksSamples ? '검출' : '판별 불가'}`));
  results.push(observation('static_data_route_hidden', '비공개 /data.json 경로에서 가상 메모가 제공되지 않음',
    !dataResponse.ok && !dataLeaksSamples ? `HTTP ${dataResponse.status}; 가상 메모 미검출` : `확인 필요: HTTP ${dataResponse.status}; 가상 메모 노출 여부 ${dataLeaksSamples ? '검출' : '미검출'}`));

  if (config.step >= 3) {
    const checks = [
      ['unauthenticated_note_list', '비로그인 메모 목록 요청 거부', '/api/notes', { method: 'GET' }],
      ['unauthenticated_note_create', '비로그인 메모 생성 요청 거부', '/api/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '가상 자체 점검', body: '저장하지 않아야 하는 가상 요청' }),
      }],
      ['unauthenticated_note_detail', '비로그인 메모 상세 요청 거부', '/api/notes/11111111-1111-4111-8111-111111111111', { method: 'GET' }],
    ];
    if (config.step >= 8) checks.push(['unauthenticated_announcement_read', '비로그인 공지 조회 요청 거부', '/api/announcements', { method: 'GET' }]);
    for (const [attackId, expected, path, options] of checks) {
      const response = await request(fetchImpl, app, path, options);
      const passed = response.status === 401;
      results.push(observation(attackId, expected,
        `${passed ? '거부 확인' : '확인 필요'} (HTTP ${response.status})`));
    }
  }
  return results;
}

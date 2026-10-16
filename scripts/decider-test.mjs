import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureRequests } from './fixture-7.mjs';

const RESPONSE_KEYS = 'decision,reasonCode,requestId,ruleIds,schema';

function validResponse(request, response, ruleIds) {
  return response && typeof response === 'object' && !Array.isArray(response)
    && Object.keys(response).sort().join(',') === RESPONSE_KEYS
    && response.schema === 'aleph.decision.v1'
    && response.requestId === request.requestId
    && ['allow', 'deny', 'step_up'].includes(response.decision)
    && typeof response.reasonCode === 'string'
    && /^[a-z][a-z0-9_]{0,63}$/u.test(response.reasonCode)
    && Array.isArray(response.ruleIds) && response.ruleIds.length > 0
    && response.ruleIds.every(id => ruleIds.includes(id));
}

// Local practice only. The class engine and the server judge validate live requests separately.
export async function checkDecider({ decide, ruleIds }) {
  if (typeof decide !== 'function' || !Array.isArray(ruleIds)
      || !ruleIds.includes('device_registered')) {
    throw new Error('6단계 device_registered 규칙을 먼저 구현하고 RULE_IDS에 적어 주세요.');
  }
  const { normal, suspicious } = fixtureRequests();
  const ordinaryDetailGet = {
    ...normal,
    requestId: randomUUID(),
    method: 'GET',
    path: '/notes/virtual-memo-1',
    route: 'GET /notes/:id',
    // Production-style signals, not the judge's unusual-access fixture.
    signals: { source: 'none', region: 'unknown', network: 'unknown', hour: 'unknown' },
    // The decider must not compare owners; the API checks the stored owner.
    resourceOwnerSubjectId: 'different-owner-fixture',
  };
  const checks = [
    { name: '등록 기기의 정상 요청', request: normal, decision: 'allow' },
    { name: '등록 기기의 정상 GET /notes/:id 허용', request: ordinaryDetailGet, decision: 'allow' },
    { name: '역할 필드가 없어도 정상 GET /notes/:id 허용', request: (() => { const { actorRole, ...request } = ordinaryDetailGet; return { ...request, requestId: randomUUID() }; })(), decision: 'allow' },
    { name: '등록 기기의 정상 GET /api/notes/:id 허용', request: { ...ordinaryDetailGet,
      requestId: randomUUID(), path: '/api/notes/virtual-memo-1', route: 'GET /api/notes/:id' }, decision: 'allow' },
    { name: 'UUID가 아닌 단건 메모 ID도 허용', request: { ...ordinaryDetailGet,
      requestId: randomUUID(), path: '/notes/not-a-uuid', route: 'GET /notes/:id' }, decision: 'allow' },
    { name: 'API 경로의 UUID가 아닌 단건 메모 ID도 허용', request: { ...ordinaryDetailGet,
      requestId: randomUUID(), path: '/api/notes/not-a-uuid', route: 'GET /api/notes/:id' }, decision: 'allow' },
    { name: '메모 목록 GET /notes는 계속 거부', request: { ...ordinaryDetailGet,
      requestId: randomUUID(), path: '/notes', route: 'GET /notes' }, decision: 'deny', reasonCode: 'starter_not_ready' },
    { name: '강사 자료 구역은 계속 거부', request: { ...ordinaryDetailGet,
      requestId: randomUUID(), service: 'instructor-materials',
      path: '/instructor-materials/handout-1', route: 'GET /instructor-materials/:id' },
      decision: 'deny', reasonCode: 'starter_not_ready' },
    { name: '미등록 기기의 가상 요청', request: { ...normal, requestId: randomUUID(),
      deviceRegistered: false }, decision: 'deny', reasonCode: 'device_not_registered' },
  ];
  if (ruleIds.includes('step_up_required')) {
    checks.push(
      { name: '복합 이상 접속', request: suspicious, decision: 'step_up',
        reasonCode: 'step_up_required' },
      { name: '역할 필드 없는 낯선 요청은 step_up', request: (() => { const { actorRole, ...request } = suspicious; return { ...request, requestId: randomUUID() }; })(),
        decision: 'step_up', reasonCode: 'step_up_required' },
      { name: '다시 확인한 복합 이상 접속', request: { ...suspicious,
        requestId: randomUUID(), stepUp: { verified: true, authAgeSeconds: 60 } },
      decision: 'allow' },
      { name: '역할 필드 없는 재확인 요청은 allow', request: (() => { const { actorRole, ...request } = suspicious; return { ...request, requestId: randomUUID(), stepUp: { verified: true, authAgeSeconds: 60 } }; })(),
        decision: 'allow' },
    );
  }
  const results = [];
  for (const item of checks) {
    const response = await decide(item.request);
    const valid = validResponse(item.request, response, ruleIds)
      && response.decision === item.decision
      && (!item.reasonCode || response.reasonCode === item.reasonCode);
    results.push({ name: item.name, passed: valid });
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { decide, RULE_IDS } = await import('../src/decider.mjs');
    const results = await checkDecider({ decide, ruleIds: RULE_IDS });
    for (const item of results) process.stdout.write(`${item.passed ? '통과' : '확인 필요'} · ${item.name}\n`);
    process.stdout.write('이 명령은 가상 요청으로 연습하며 심판 통과 증거가 아닙니다.\n');
    if (results.some(item => !item.passed)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`판정기 연습 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}

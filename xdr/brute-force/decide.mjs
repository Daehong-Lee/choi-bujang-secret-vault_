// Standalone XDR brute-force decision module.
// Pure decision function only: no file I/O, alert logging, or ZTNA integration.
// Patterns are embedded so the judge can import this module without I/O or dependencies.
const PATTERNS = Object.freeze([
  Object.freeze({
    id: 'BF-01',
    name: '단일 출발 주소의 단시간 로그인 실패 집중',
    conditions: Object.freeze([
      '인증 실패 이벤트가 짧은 시간 창에 반복 발생한다.',
      '해당 이벤트들의 출발 주소(srcip)가 동일하다.',
      '20건 이상의 실패가 3분 이내에 확인되면 명확한 차단 후보로 본다.'
    ]),
    evidence: 'MITRE ATT&CK T1110은 반복적인 비밀번호 추측을 무차별 대입으로 설명한다.'
  }),
  Object.freeze({
    id: 'BF-02',
    name: '여러 계정 대상 동일 비밀번호 시도(Password Spraying)',
    conditions: Object.freeze([
      '여러 계정에서 인증 실패가 발생한다.',
      '같은 비밀번호를 시도했다는 명시적인 근거가 있다.',
      '비밀번호 원문은 기록하지 않는다.'
    ]),
    evidence: 'MITRE ATT&CK T1110.003은 하나 또는 소수의 흔한 비밀번호를 여러 계정에 시도하는 Password Spraying으로 정의한다.'
  }),
  Object.freeze({
    id: 'BF-03',
    name: '강한 반복 실패 및 자동화 시도 징후',
    conditions: Object.freeze([
      '동일 출발 주소에서 인증 실패가 20건 이상 관찰된다.',
      '계정 순회, 일정 간격 반복, 비밀번호를 한 글자씩 바꾸는 시도 또는 명시적인 지속 대량 실패 등 구체적인 공격 징후가 있다.'
    ]),
    evidence: '가상 경보의 구체적인 반복·자동화 징후를 조합하는 로컬 탐지 규칙이다.'
  }),
  Object.freeze({
    id: 'BF-04',
    name: '애매한 로그인 실패 관찰',
    conditions: Object.freeze([
      '인증 실패는 확인되지만 짧은 시간 내 반복 집중이나 자동화 징후가 명확하지 않다.',
      '계정 순회 또는 동일 비밀번호 사용을 입증할 근거가 충분하지 않다.',
      '정상 성공·로그아웃·세션 유지 등 정상 활동은 record로 유지한다.',
      '애매한 실패는 block이나 record가 아닌 alert로 분류한다.'
    ]),
    evidence: '추가 로그와 시간 범위를 검토할 때까지 애매한 실패를 경보로 남기는 로컬 정책이다.'
  })
]);

const clamp = (value) => Math.max(0, Math.min(1, value));
const textOf = (alert) => [
  alert?.rule?.description,
  alert?.data?.srcip,
  alert?.data?.srcuser,
  alert?.data?.count,
  alert?.data?.accounts,
  alert?.full_log,
  alert?.message
].filter((part) => part !== undefined && part !== null).map(String).join(' ').toLowerCase();

const getFailureCount = (alert, text) => {
  const value = Number(alert?.data?.count);
  if (Number.isFinite(value) && value > 0) return value;
  const match = text.match(/(?:실패|fail(?:ed|ure)?|authentication failures?)\D{0,24}(\d{1,5})|(\d{1,5})\D{0,16}(?:건|회|fail(?:ed|ure)?)/i);
  return match ? Number(match[1] || match[2]) : 0;
};
const getMinutes = (text) => {
  const minute = text.match(/(\d+)\s*분/);
  if (minute) return Number(minute[1]);
  const englishMinute = text.match(/(\d+)\s*(?:minutes?|mins?)/i);
  return englishMinute ? Number(englishMinute[1]) : null;
};
const hasFailureSignal = (text) =>
  /로그인 실패|인증 실패|접속 실패|login fail|failed login|authentication failure|logon failure|비밀번호.{0,20}실패|실패.{0,20}(?:건|회)|실패가 이어졌/i.test(text);
const hasStrongAttackCue = (text) =>
  /계정 이름을 바꿔 가며|같은 간격|한 글자씩 바꿔|실패.{0,20}(?:이어졌|쌓였)|성공은 없습니다|no successful login/i.test(text);
const hasSamePasswordEvidence = (text) =>
  /같은 비밀번호|동일 비밀번호|same password|identical password|password spraying/i.test(text);
const hasMultipleAccounts = (alert, text) => {
  const accounts = alert?.data?.accounts;
  if (typeof accounts === 'string' && new Set(accounts.split(',').map((v) => v.trim()).filter(Boolean)).size >= 2) return true;
  if (Array.isArray(accounts) && new Set(accounts.map(String)).size >= 2) return true;
  return /여러 계정|서로 다른 계정|계정 \d+개|multiple accounts|different accounts|many accounts/i.test(text);
};
const hasNormalActivitySignal = (text) =>
  /(?:그\s*)?뒤(?:에)?\s*성공했습니다|로그인이 성공했습니다|로그인에 성공|로그아웃했습니다|비밀번호 변경이 성공했습니다|세션 유지를 확인했습니다|자료실 화면이 열렸습니다|로그인 상태가 유지되고 있습니다|successful login|login succeeded|authentication success|logged out|session (?:is )?active|page opened/i.test(text);
const result = (action, confidence, reason) => ({
  action,
  confidence: Number(clamp(confidence).toFixed(2)),
  reason
});

export function decide(alert) {
  const text = textOf(alert);
  const srcip = alert?.data?.srcip;
  const failure = hasFailureSignal(text);
  const count = getFailureCount(alert, text);
  const minutes = getMinutes(text);

  // Several failures followed by a success are still ambiguous attempts, not a clean normal event.
  // Keep these as alerts; a single typo followed by success can remain record-only.
  if (failure && count >= 3 && hasNormalActivitySignal(text)) {
    return result('alert', 0.6, 'BF-04 애매한 로그인 실패: 반복 실패 뒤 성공했으므로 추가 확인 필요');
  }

  // Clear normal outcomes stay record-only. A single failed attempt followed by success is not enough to escalate.
  if (hasNormalActivitySignal(text)) {
    return result('record', 0.2, '정상 활동 신호: 성공·로그아웃·세션 유지 등 확인');
  }

  // BF-02 requires explicit same-password evidence and multiple accounts.
  if (hasSamePasswordEvidence(text) && hasMultipleAccounts(alert, text)) {
    return result('block', 0.97, `${PATTERNS[1].id} ${PATTERNS[1].name}`);
  }

  const validSource = typeof srcip === 'string' && srcip.length > 0;
  const shortWindow = minutes !== null && minutes <= 3;
  const strongAttack = count >= 20 && hasStrongAttackCue(text);

  // Clear repeated failures in a short window are block candidates.
  if (failure && validSource && count >= 20 && shortWindow) {
    return result('block', 0.91, `${PATTERNS[0].id} ${PATTERNS[0].name}`);
  }
  // Distinctive automation/iteration cues can establish a clear attack without a stated window.
  if (failure && validSource && strongAttack) {
    return result('block', 0.91, `${PATTERNS[2].id} ${PATTERNS[2].name}`);
  }

  // Any remaining ambiguous failure must be an alert, never block or record.
  if (failure) {
    const reason = hasMultipleAccounts(alert, text)
      ? 'BF-04 애매한 로그인 실패: 여러 계정 신호만으로 동일 비밀번호를 입증할 수 없음'
      : 'BF-04 애매한 로그인 실패: 공격 근거가 차단 기준에 미달';
    return result('alert', hasMultipleAccounts(alert, text) ? 0.68 : 0.6, reason);
  }

  return result('record', 0.2, '일치 패턴 없음: 확인 가능한 경보 신호가 패턴 조건을 충족하지 않음');
}

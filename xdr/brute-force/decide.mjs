// Standalone XDR brute-force decision module.
// Patterns are embedded here so the judge can import this file without I/O or dependencies.
const PATTERNS = Object.freeze([
  Object.freeze({
    id: 'BF-01',
    name: '단일 출발 주소의 단시간 로그인 실패 집중',
    conditions: Object.freeze([
      '인증 실패 이벤트가 짧은 시간 창에 반복 발생한다.',
      '해당 이벤트들의 출발 주소(srcip)가 동일하다.',
      '탐지 임계값과 시간 창은 환경의 정상 로그인량에 맞춰 별도 설정한다.'
    ]),
    evidence: 'MITRE ATT&CK T1110은 반복적인 비밀번호 추측을 무차별 대입으로 설명하며, T1110.001은 반복적인 인증 실패를 동반할 수 있다고 명시한다.'
  }),
  Object.freeze({
    id: 'BF-02',
    name: '여러 계정 대상 동일 비밀번호 시도(Password Spraying)',
    conditions: Object.freeze([
      '짧은 시간 창에 서로 다른 여러 계정에서 인증 실패가 발생한다.',
      '이벤트의 출발 주소가 같거나 동일한 공격 흐름으로 상관분석된다.',
      '로그에 비밀번호 원문을 저장하지 않고, 사용 가능한 경우에만 안전한 동일값 지표로 같은 비밀번호 사용을 확인한다.'
    ]),
    evidence: 'MITRE ATT&CK T1110.003은 하나 또는 소수의 흔한 비밀번호를 여러 계정에 시도하는 Password Spraying으로 정의한다.'
  })
]);

const clamp = (value) => Math.max(0, Math.min(1, value));
const textOf = (alert) => {
  const parts = [
    alert?.rule?.description,
    alert?.data?.srcip,
    alert?.data?.srcuser,
    alert?.data?.count,
    alert?.data?.accounts,
    alert?.full_log,
    alert?.message
  ];
  return parts.filter((part) => part !== undefined && part !== null)
    .map(String).join(' ').toLowerCase();
};
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
  if (englishMinute) return Number(englishMinute[1]);
  if (/1\s*분|one minute|within a minute|1\s*min/i.test(text)) return 1;
  return null;
};
const hasFailureSignal = (text) =>
  /로그인 실패|인증 실패|접속 실패|login fail|failed login|authentication failure|logon failure/i.test(text);
const hasSamePasswordEvidence = (text) =>
  /같은 비밀번호|동일 비밀번호|same password|identical password|password spraying/i.test(text);
const hasMultipleAccounts = (alert, text) => {
  const accounts = alert?.data?.accounts;
  if (typeof accounts === 'string' && new Set(accounts.split(',').map((v) => v.trim()).filter(Boolean)).size >= 2) return true;
  if (Array.isArray(accounts) && new Set(accounts.map(String)).size >= 2) return true;
  return /여러 계정|서로 다른 계정|계정 \d+개|multiple accounts|different accounts|many accounts/i.test(text);
};
const result = (confidence, reason) => {
  const score = clamp(confidence);
  return {
    action: score >= 0.85 ? 'block' : score >= 0.5 ? 'alert' : 'record',
    confidence: Number(score.toFixed(2)),
    reason
  };
};

export function decide(alert) {
  const text = textOf(alert);
  const srcip = alert?.data?.srcip;
  const failure = hasFailureSignal(text);
  const count = getFailureCount(alert, text);
  const minutes = getMinutes(text);

  // BF-02 requires explicit evidence of the same password and multiple accounts.
  if (hasSamePasswordEvidence(text) && hasMultipleAccounts(alert, text)) {
    return result(0.97, `${PATTERNS[1].id} ${PATTERNS[1].name}`);
  }

  // BF-01 needs a source address, repeated failures, and an explicit short window.
  if (failure && typeof srcip === 'string' && srcip.length > 0 && count > 0 && minutes !== null && minutes <= 3) {
    if (count >= 20) return result(0.91, `${PATTERNS[0].id} ${PATTERNS[0].name}`);
    if (count >= 10) return result(0.78, `${PATTERNS[0].id} ${PATTERNS[0].name}`);
    if (count >= 5) return result(0.58, `${PATTERNS[0].id} ${PATTERNS[0].name}`);
    return result(0.42, `${PATTERNS[0].id} 신호는 있으나 반복 강도가 약함`);
  }

  // Multi-account activity without evidence of a reused password is not enough
  // to claim password spraying; keep it as a lower-confidence observation.
  if (failure && hasMultipleAccounts(alert, text)) {
    return result(0.45, '일치 패턴 없음: 여러 계정 신호만으로 동일 비밀번호 시도를 확인할 수 없음');
  }

  return result(0.2, '일치 패턴 없음: 확인 가능한 경보 신호가 패턴 조건을 충족하지 않음');
}

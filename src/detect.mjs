// 9단계 로컬 탐지 연습. 운영 반 엔진이 검증한 사건을 전달하는 연결은 별도입니다.
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 120;
const OBSERVE = Object.freeze({ action: 'observe' });

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');

  const bySubject = new Map();
  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)
        || event.method !== 'GET' || typeof event.at !== 'string'
        || typeof event.identity?.sub !== 'string' || !event.identity.sub) continue;
    const at = Date.parse(event.at);
    if (!Number.isFinite(at)) continue;
    const subject = event.identity.sub;
    const bucket = bySubject.get(subject) ?? [];
    bucket.push(at);
    bySubject.set(subject, bucket);
  }

  for (const [subject, timestamps] of bySubject) {
    timestamps.sort((a, b) => a - b);
    let start = 0;
    for (let end = 0; end < timestamps.length; end += 1) {
      while (timestamps[end] - timestamps[start] > WINDOW_MS) start += 1;
      if (end - start + 1 > LIMIT) {
        return { action: 'propose_revocation', reasonCode: 'burst_read', subject };
      }
    }
  }
  return { ...OBSERVE };
}

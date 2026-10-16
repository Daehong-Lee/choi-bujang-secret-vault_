// 9단계 탐지 함수: 사건의 at, method, identity.sub만 사용합니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 120;

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');

  const readsBySubject = new Map();
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;

    const at = Date.parse(event.at);
    const method = event.method;
    const subject = event.identity?.sub;
    if (!Number.isFinite(at) || method !== 'GET' || typeof subject !== 'string' || subject.length === 0) continue;

    if (!readsBySubject.has(subject)) readsBySubject.set(subject, []);
    readsBySubject.get(subject).push(at);
  }

  for (const [subject, timestamps] of readsBySubject) {
    timestamps.sort((a, b) => a - b);
    let left = 0;
    for (let right = 0; right < timestamps.length; right += 1) {
      while (timestamps[right] - timestamps[left] > WINDOW_MS) left += 1;
      if (right - left + 1 > LIMIT) {
        return { action: 'propose_revocation', reasonCode: 'burst_read', subject };
      }
    }
  }

  return { action: 'observe' };
}

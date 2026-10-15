import { numberOf, normalActivity, result, textOf } from '../common.mjs';

const KNOWN_CLASS_DESTINATIONS = new Set(['192.0.2.10', '198.51.100.10']);

export function decide(alert) {
  const text = textOf(alert);
  const bytes = numberOf(alert?.data?.bytes);
  const files = numberOf(alert?.data?.files);
  const count = numberOf(alert?.data?.count);
  const destination = typeof alert?.data?.dstip === 'string' ? alert.data.dstip : '';
  const unfamiliar = Boolean(destination) && !KNOWN_CLASS_DESTINATIONS.has(destination);
  const strongCue = /처음 보는 목적지|처음 보는 주소|외부 주소|자료실 전체|명령 통로|평소에 쓰지 않던 포트|같은 목적지로 대용량|같은 압축 파일/u.test(text);
  const readThenTransfer = /자료 \d+건이 한 번에 읽힌 뒤 전송/u.test(text);
  if (normalActivity(text) && bytes < 1000000 && !strongCue) return result('record', 0.2, '정상 자료실·수업 자료 전송으로 분류');
  if (bytes >= 50000000 && unfamiliar && (strongCue || files >= 50 || count >= 8)) {
    return result('block', 0.94, '대용량 외부 전송과 비정상 목적지 징후가 함께 확인됨');
  }
  if (unfamiliar && (bytes >= 5000000 || files >= 2 || count >= 2 || strongCue || readThenTransfer)) {
    return result('alert', 0.65, '비정상 목적지 또는 전송량 징후 추가 확인 필요');
  }
  return result('record', 0.2, '강한 자료 유출 징후 없음');
}

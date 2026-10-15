import { normalActivity, result, textOf } from '../common.mjs';

export function decide(alert) {
  const text = textOf(alert);
  const tempPath = /\\(?:appdata\\local\\temp|temp)\\/u.test(text);
  const startupPath = /\\startup\\/u.test(text);
  const service = !/서비스 등록은 없습니다|서비스 등록이 없습니다|등록은 없습니다/u.test(text)
    && /서명 없는 새 서비스|새 서비스|서비스 실행 파일|서비스가 바뀌|서비스 등록이 연속/u.test(text);
  const task = /예약 작업|시작 폴더|시작 프로그램|시작 항목|다시 켜도 남도록/u.test(text);
  const strong = /서명 없는 새 서비스|시작 폴더에.{0,30}프로그램이 추가|서비스 실행 파일이 바뀌었고 서명이 없습니다|연속으로 3건|같은 임시 파일을 함께|다시 켜도 남도록/u.test(text)
    || (tempPath && (service || task)) || (startupPath && /평소 목록에 없는|새로|추가/u.test(text));
  if (normalActivity(text)) return result('record', 0.2, '기존 정상 작업으로 분류');
  if (strong) return result('block', 0.92, '지속성 등록과 비정상 실행 경로가 함께 확인됨');
  if (/서비스|예약 작업|시작 폴더|시작 항목|임시 폴더|서명은 확인되지|서비스 설명/u.test(text)) {
    return result('alert', 0.6, '지속성 변경 징후는 있으나 차단 근거가 충분하지 않음');
  }
  return result('record', 0.2, '지속성 변경 징후 없음');
}

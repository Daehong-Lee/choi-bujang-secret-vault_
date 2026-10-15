import { numberOf, normalActivity, result, textOf } from '../common.mjs';

export function decide(alert) {
  const text = textOf(alert);
  const count = numberOf(alert?.data?.count);
  const marker = /doc-(?:sql|script|up-repeat|cmd-separator|mixed-marker|one-marker|one-fragment)/u.test(text);
  const explicit = /sql 구문을 이어 붙|스크립트 삽입 표기|경로를 여러 단계 거슬러|명령 구분자 표기|데이터베이스 조회를 이어 붙|경로 이탈 표기|주입 표기/u.test(text);
  if (normalActivity(text)) return result('record', 0.2, '정상 조회 활동으로 분류');
  if ((marker || explicit) && count >= 8) return result('block', 0.94, '반복 주입 표식과 요청 횟수 기준 충족');
  if (marker || explicit || /주입처럼 보이는 표기/u.test(text)) {
    return result('alert', 0.62, '주입 가능 표식은 있으나 반복 차단 기준 미달');
  }
  return result('record', 0.2, '확인 가능한 반복 주입 표식 없음');
}

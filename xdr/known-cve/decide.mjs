import { normalActivity, result, textOf } from '../common.mjs';

export function decide(alert) {
  const text = textOf(alert);
  const payload = /\$\{\s*jndi\s*:\s*(?:ldap|ldaps|rmi|dns)\s*:/u.test(text);
  if (normalActivity(text)) return result('record', 0.2, '정상 활동으로 분류');
  if (payload) return result('block', 0.98, '완전한 JNDI 원격 조회 표식 확인');
  if (/조회 형태가 잘린|원격 조회 형태가 불완전|lookup-fragment|jndi.{0,20}(?:표식|조각)/u.test(text)) {
    return result('alert', 0.58, '불완전한 취약점 표식으로 추가 확인 필요');
  }
  return result('record', 0.2, '실행 가능한 원격 조회 표식 없음');
}

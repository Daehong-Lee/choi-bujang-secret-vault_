import { normalActivity, result, textOf } from '../common.mjs';

export function decide(alert) {
  const text = textOf(alert);
  const group = typeof alert?.data?.group === 'string' ? alert.data.group.toLowerCase() : '';
  const adminGroup = group === 'administrators'
    || /관리자 그룹에 (?:추가|들어가)|관리자 그룹에서 빠진 계정.{0,30}다시 관리자로/u.test(text);
  const elevated = /관리자 권한으로|관리자 명령|권한 상승|다른 계정의 권한/u.test(text);
  const strong = (adminGroup && /추가됐|들어가|추가/u.test(text))
    || /관리자 그룹에 들어가고 곧바로 권한 명령|방금 관리자가 된|다른 계정의 권한으로 관리자 명령|관리자 그룹에서 빠진 계정.{0,30}다시 관리자로/u.test(text)
    || (/관리자 명령/u.test(text) && /처음 보는 주소|업무처럼 보이지 않는 시각|원격 주소/u.test(text))
    || (/관리자 권한으로|권한으로 바뀌었/u.test(text) && /처음 보는 주소|처음 봅니다|원격 주소/u.test(text));
  if (normalActivity(text)) return result('record', 0.2, '정상 계정 활동으로 분류');
  if (strong) return result('block', 0.93, '관리자 권한 부여 또는 비정상 권한 사용 확인');
  if (adminGroup || elevated || /권한.{0,12}(?:변경|상승)|새 로컬 그룹/u.test(text)) {
    return result('alert', 0.62, '권한 변경 징후가 있으나 차단 기준 미달');
  }
  return result('record', 0.2, '권한 상승 징후 없음');
}

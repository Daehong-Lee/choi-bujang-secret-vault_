export function textOf(alert) {
  const parts = [];
  const visit = (value) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parts.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === 'object') {
      for (const item of Object.values(value)) visit(item);
    }
  };
  visit(alert);
  return parts.join(' ').toLowerCase();
}

export function numberOf(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function result(action, confidence, reason) {
  return { action, confidence: Math.max(0, Math.min(1, Number(confidence.toFixed(2)))), reason };
}

export function normalActivity(text) {
  return /로그인(?:했습니다|이 성공)|로그아웃|세션 유지|정적 화면|화면을 새로고침|자료실 화면|내 메모.{0,12}(?:조회|저장)|반 공지.{0,12}조회|검색 결과 한 페이지|상태 확인 주소|수업 자료 주소|정의 업데이트|기존 수업 도구|기존 예약 작업|그룹 소속을 읽기|자기 세션 정보|첨부 그림 한 장|수업 공지.{0,12}조회|자료실을 열었/u.test(text);
}

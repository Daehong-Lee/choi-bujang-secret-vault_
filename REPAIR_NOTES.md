# 코드 전체 점검·수정 기록

## 수정한 항목

- API가 `SUPABASE_URL` 또는 `SUPABASE_SECRET_KEY` 누락 때문에 모듈 초기화 단계에서 바로 500으로 끝나지 않도록 요청 시 설정을 검증하고, 비밀값 없이 `reason` 코드를 반환합니다.
- Supabase URL과 `aleph.config.json`의 로그인 발급자 프로젝트가 서로 다르면 `SUPABASE_URL_ISSUER_MISMATCH`로 거부합니다.
- DB 오류는 권한 거부, 테이블 누락, 열 누락, 제약 조건 실패 등 안전한 코드로 구분합니다. 원시 DB 오류나 키 값은 응답에 포함하지 않습니다.
- 9단계 탐지 함수에 10분 이동 구간·사용자별 GET 120건 초과 규칙을 구현했습니다.
- 비어 있던 XDR 5개 판정 모듈을 추가했습니다. 여섯 모듈 모두 가상 경보만 분류하며 실제 시스템을 차단하지 않습니다.
- 배포 자기 점검을 현재 8단계 경로에 맞춰 수정했습니다. 정적 `/data.json` 노출과 비로그인 API 요청을 실제 HTTP 응답으로 기록합니다.
- DB 마이그레이션에서 이미 UUID 형식인 ID를 보존하고, `PUBLIC`·`anon`·`authenticated`의 테이블 권한을 회수하며 서버용 `service_role` 권한을 명시했습니다.
- `npm test`를 표준 테스트 명령으로 추가했습니다.

## 로컬에서 실행한 검사

- `npm test`: 통과
- `npm run detect:test`: 6개 가상 시나리오 통과
- `npm run decider:test`: 4개 가상 시나리오 통과
- `npm run fixture:7`: 통과
- `npm run test:r5`: 통과
- `npm run test:package`: 통과
- `npm run build -- --local`: 통과
- Vercel 배포 메타데이터를 가상 값으로 넣은 `npm run build`: 통과
- 여섯 XDR 모듈의 실행기 검사: 전부 통과
- JS/MJS 및 HTML 인라인 스크립트 구문 검사, JSON 파싱, `git diff --check`, 비밀값 패턴 검사: 통과

## 아직 외부 설정·실서비스 확인이 필요한 항목

- 이 검사 환경에서는 npm 레지스트리에서 외부 의존성을 설치할 수 없어 Supabase SDK/JWT 검증을 실제로 호출하는 통합 시험을 실행하지 못했습니다.
- 실제 Vercel 환경변수, Supabase 계정 로그인, DB 마이그레이션, 실서비스 메모 생성·조회·수정·삭제는 이 ZIP만으로 확인할 수 없습니다. SQL은 Supabase SQL Editor에서 검토·실행해야 합니다.
- `api/ai.js`와 `api/threat-intel.js`는 원본 문서가 명시한 미구현 시작 뼈대(HTTP 501)로 유지했습니다. AI 공급자·모델·키 관리 및 호출 제한 정책이 정해지지 않은 상태에서 임의의 외부 서비스를 선택하거나 성공 응답을 가장하지 않았습니다.
- `npm run bundle`은 커밋된 깨끗한 Git 작업 트리와 로컬 `bundle-notes.json`을 요구하며, 현재 배포 주소로 실제 HTTP 점검도 수행합니다. 사용자 저장소를 임의 커밋하거나 실서비스 요청을 보내지 않기 위해 이 명령은 실행 완료로 보고하지 않습니다.

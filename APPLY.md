# 로그인 및 배포 불일치 확인 패치

이 ZIP은 기존 프로젝트에 덮어쓸 선택 파일만 포함합니다. 저장소 전체를 대체하지 마세요.

## 포함 파일
- `public/auth-config.js`: Supabase URL/Publishable Key 값을 대괄호 없이 사용
- `public/auth.js`: 잘못된 설정이면 로그인 영역에 원인을 표시하고, 로그인/로그아웃 네트워크 오류를 처리
- `public/index.html`: ID별 메모 조회 UI를 유지하고, 배포 확인용 `vault-build-id` 메타 태그 추가
- `test/login-deployment-regression.test.mjs`: 설정 형식, ID별 경로, 목록 GET 미호출을 검사

## 적용
1. ZIP 안 `public/` 파일 3개를 저장소의 같은 경로에 덮어씁니다.
2. `test/login-deployment-regression.test.mjs`를 저장소의 `test/`에 복사합니다.
3. 로컬에서 `node --test test/login-deployment-regression.test.mjs` 실행합니다.
4. 변경 파일을 커밋하고 Vercel의 해당 `main` 배포가 Ready가 된 뒤, 브라우저에서 `Ctrl+Shift+R`로 강력 새로고침합니다.
5. `view-source:https://choi-bujang-secret-vault-kohl.vercel.app/`를 열고 `login-id-crud-fix-2026-10-14`를 검색합니다. 이 표식이 없으면 새 HTML이 서비스되지 않은 것이므로, 로그인 코드를 다시 고치기 전에 Vercel의 실제 Production 배포와 도메인 연결을 확인합니다.
6. DevTools Network에서 `GET /api/notes`가 더는 발생하지 않는지 확인합니다. `GET /api/notes/:id`와 `POST /api/notes`는 각각 메모 ID 조회와 메모 추가 용도입니다.

## 보안 정책
`GET /api/notes`의 403은 ID 없는 목록 조회를 차단하는 정상 정책이므로 이를 허용하도록 바꾸지 않습니다. 이 패치는 DB 계정, 실제 로그인, 운영 API CRUD 성공을 증명하지 않습니다.

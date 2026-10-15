# 8단계 일반 메모 생성 권한 패치

이 패치는 다음 파일만 교체합니다.
- `src/decider.mjs`
- `aleph.config.json`
- `test/resource-zones.test.mjs`
- `test/api-resource-authorization.test.mjs`
- `docs/DECIDER_REQUEST.md`
- `README.md`

핵심 변경은 `POST /api/notes`를 명시적으로 허용 목록에 추가하고, 판정기에서 `POST /notes` 및 정확한 `/api` 경로 별칭을 같은 생성 경로로 판정하는 것입니다. `GET /notes` 메모 목록 조회, 공지 쓰기, 강사 자료 및 알 수 없는 경로는 계속 거부합니다. 메모 생성 API는 기존대로 검증된 로그인에서 사용자 ID를 얻어 `owner_id`를 설정합니다. 이메일 주소를 코드에 하드코딩하지 않습니다.

GitHub 웹 편집기에서 각 파일을 같은 경로의 기존 파일과 교체한 뒤 커밋하면 연결된 Vercel이 새 배포를 시작합니다. ZIP 전체를 기존 저장소 위에 덮어쓰지 마세요.

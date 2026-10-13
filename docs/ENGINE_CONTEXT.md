# API와 신뢰된 엔진 판정 연결

자료 상세 API는 엔진 컨텍스트가 있으면 반드시 서명을 확인하고 `src/decider.mjs`에 다시 전달합니다. 브라우저의 JSON 본문이나 `role` 값은 엔진 신뢰 정보로 사용하지 않습니다.

## 서버 설정

- `ALEPH_ENGINE_CONTEXT_SECRET`: 엔진 릴레이와 API 서버에만 설정하는 공통 비밀값(최소 32자). 클라이언트 코드, 정적 파일, 제출 JSON에 넣지 않습니다.
- 요청 헤더 `x-aleph-engine-context`: 아래 envelope JSON을 UTF-8로 직렬화한 뒤 base64url로 인코딩한 값.
- 요청 헤더 `x-aleph-engine-signature`: 인코딩된 헤더 값 자체에 대한 HMAC-SHA256의 소문자 16진수 서명.

Envelope 구조:

```json
{
  "loginUserId": "검증된 로그인 토큰의 사용자 UUID",
  "decisionRequest": {
    "schema": "aleph.decision.v1",
    "requestId": "엔진이 발급한 UUID",
    "classId": "엔진 확인 반 ID",
    "projectId": "엔진 확인 프로젝트 ID",
    "subjectId": "엔진 확인 가명 주체 ID",
    "resourceOwnerSubjectId": "엔진 확인 자원 소유자의 가명 주체 ID",
    "actorRole": "student 또는 instructor",
    "deviceId": "등록 기기의 16자리 소문자 16진수 ID",
    "service": "notes 또는 announcements",
    "method": "실제 HTTP 메서드",
    "path": "/notes/UUID 또는 /announcements/UUID",
    "route": "GET /notes/:id 등 허용된 경로 서명",
    "queryLength": 0,
    "querySha256": "빈 문자열의 SHA-256",
    "at": "현재 UTC ISO 시각",
    "policyRevision": 1,
    "deviceRegistered": true,
    "stepUp": { "verified": false, "authAgeSeconds": null },
    "recentEvents": [],
    "signals": { "source": "none", "region": "unknown", "network": "unknown", "hour": "unknown" }
  }
}
```

`decisionRequest`의 모든 키는 `src/decider.mjs`가 요구하는 고정 계약과 일치해야 합니다. 예시는 구조 설명용이며 운영 값은 신뢰된 엔진이 직접 채워 서명해야 합니다. 실제 HTTP URL은 `/api/notes/UUID` 또는 `/api/announcements/UUID`와 정확히 일치해야 하고, 쿼리 문자열은 허용되지 않습니다. 판정 요청 안의 `path`는 계약상 `/notes/UUID` 또는 `/announcements/UUID`로 정규화합니다.

## 누락 시 처리

- 자기 메모 `GET`은 검증된 로그인·DB 소유자 일치와 유효한 서명 엔진 컨텍스트를 모두 요구합니다. 정상 소유자·등록 기기·정확한 GET 경로의 엔진 판정은 허용하고, 컨텍스트가 없거나 서명·경로가 틀리면 거부합니다.
- 메모 수정·삭제 및 공지 수정·삭제는 서명된 엔진 컨텍스트가 없거나 무효이면 거부됩니다.
- 다른 소유자의 메모는 엔진 컨텍스트 유무와 관계없이 DB 소유자 검사에서 거부됩니다. 공지 변경은 검증된 강사 신원과 DB 소유자 검사를 모두 통과해야 합니다.

이 계약은 엔진 릴레이가 해당 헤더를 실제로 생성·서명하도록 배포되어야 운영에서 완전히 적용됩니다. 브라우저에서 이 헤더를 직접 생성하게 해서는 안 됩니다.

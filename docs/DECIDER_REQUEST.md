# 학생 판정기 요청·응답 계약 v1

`src/decider.mjs`의 `decide(request)`는 반 엔진이 신원, 기기, 경로를 확인한 뒤 전달한 요청만 받습니다. 브라우저가 보낸 사용자 번호·역할·기기 상태를 따로 믿거나 요청에 덧붙이지 마세요. 이 문서는 현재 `student-kit/sdp-core/decision-contract.mjs`의 `aleph.decision.v1` 계약을 설명합니다.

## 요청

요청은 아래 **20개 이름만** 포함합니다. `actorRole`과 `resourceOwnerSubjectId`는 고정 요청 스키마의 엔진 확인값입니다. 이 값들을 브라우저에서 만들면 안 됩니다. 다만 8단계 경로 판정기는 역할이나 소유자 비교로 접근 권한을 부여하지 않습니다. 저장된 자료의 소유권은 API가 검증된 로그인 신원과 DB 행을 비교해 확인합니다.

| 항목 | 뜻 |
|---|---|
| `schema` | 항상 `aleph.decision.v1` |
| `requestId` | 이번 요청의 UUID. 응답에 그대로 돌려줍니다. (실제 자료 경로의 ID와는 별개입니다.) |
| `classId`, `projectId` | 운영 엔진이 확인한 반과 학생 프로젝트 |
| `subjectId` | 발급자·대상·반·프로젝트를 묶어 만든 가명 주체 ID. Supabase 사용자 번호와 직접 비교하지 않습니다. |
| `actorRole` | 엔진이 확인한 `student` 또는 `instructor`. 고정 계약 필드이며 클라이언트가 정한 역할은 사용하지 않습니다. 8단계 경로 허용 여부를 결정하는 데 사용하지 않습니다. |
| `resourceOwnerSubjectId` | 엔진이 확인한 자원 소유자의 가명 ID. 고정 계약 필드지만 8단계 판정기는 `subjectId`와 비교하지 않습니다. 실제 소유권 검사는 API가 DB의 `owner_id`와 검증된 로그인 사용자 ID를 비교합니다. |
| `deviceId` | 확인된 기기의 16자리 소문자 16진수 ID. 개인키가 아닙니다. |
| `service`, `method`, `path`, `route` | 확인된 서비스와 요청 경로. `route`는 `GET /notes/:id`처럼 허용된 경로 모양입니다. |
| `queryLength`, `querySha256` | 쿼리 문자열의 길이와 SHA-256 지문. 원문 쿼리는 전달되지 않습니다. |
| `at` | 엔진이 만든 UTC ISO 시각. 판정 시각과 5초 넘게 차이 나면 거부됩니다. |
| `policyRevision` | 이번 요청에 적용된 정책 버전 |
| `deviceRegistered` | 기기 등록 여부. 실제 릴레이는 미등록 기기를 판정기보다 먼저 막습니다. `false`는 심판의 가상 요청에서만 올 수 있습니다. |
| `stepUp` | `{verified, authAgeSeconds}`. `verified`가 false이면 나이는 `null`입니다. true일 때 나이는 0~900초입니다. 이 값만 보고 재인증 확인 요청을 건너뛰지 않습니다. |
| `recentEvents` | 엔진이 제공한 최근 사건 배열. 최대 12건이며 각 항목은 `{kind, ageSeconds, count}`입니다. |
| `signals` | `{source, region, network, hour}`. 현재 실제 경로에서는 `source: "none"`, `region/network: "unknown"`입니다. `judge_fixture` 신호를 실제 위치 증거로 취급하지 않습니다. |

이 판정기는 고정 스키마에 `actorRole`과 `resourceOwnerSubjectId`가 포함되어 있는지와 형식을 확인하지만, 이 값으로 역할·소유권 권한을 부여하지 않습니다. 운영 엔진은 계약 필드를 신뢰 가능한 출처에서 채워야 하며, 브라우저 요청이나 임의 상수로 값을 채우면 안 됩니다.

## 응답

`decide(request)`는 다음 **5개 이름만** 담은 객체를 반환합니다.

```js
{
  schema: 'aleph.decision.v1',
  requestId: request.requestId,
  decision: 'allow', // 'allow' | 'deny' | 'step_up'
  reasonCode: 'approved',
  ruleIds: ['my_verified_rule'],
}
```

`reasonCode`는 운영 등록부의 `allowedReasonCodes`에 있는 소문자 코드여야 합니다. 거부와 추가 확인에는 적어도 하나의 규칙 이름이 필요합니다. 응답이 늦거나 형식·요청 ID·이유 코드가 맞지 않으면 엔진은 접근을 허용하지 않습니다. 학생 코드가 `allow`를 반환해도 엔진의 앞선 신원·기기·경로 검사를 되돌릴 수 없습니다.

`step_up`은 엔진에 추가 본인 확인을 요청하는 결정입니다. 단순 `deny`는 재인증 화면으로 이어지지 않습니다. 기존 7단계의 로컬 연습은 `npm run fixture:7`로 정상 요청과 복합 이상 요청 두 건을 비교합니다. 이 연습은 심판 판정이나 실제 학생 접속 증거가 아닙니다.

## 8단계 자원 구역 규칙

- 메모 상세 경로는 `GET /notes/:id`, `PUT /notes/:id`, `DELETE /notes/:id`만 허용합니다. `:id`는 `/`가 아닌 단일 경로 조각이며, UUID 형식으로 제한하지 않습니다. 실제 DB API는 별도로 DB ID 형식을 검증할 수 있습니다.
- `GET /notes` 및 `POST /notes` 같은 ID 없는 메모 경로는 판정기에서 허용하지 않습니다. 메모의 실제 소유권은 API가 저장된 `resource_type=memo`, `owner_id`와 검증된 로그인 신원을 비교해 확인합니다. 다른 소유자의 자료는 API에서 거부합니다.
- 공지는 `GET /announcements`와 `GET /announcements/:id`만 판정기에서 허용합니다. 공지의 `POST`, `PUT`, `PATCH`, `DELETE`는 역할과 무관하게 판정기에서 모두 거부합니다. 강사 관리가 필요하면 별도 서버 관리 경로에서 검증된 강사 신원과 저장된 자료 소유권을 확인해야 하며, 판정기의 허용 경로로 추가하면 안 됩니다.
- 강사 자료 구역 및 알 수 없는 경로, 추가 하위 경로, 쿼리 문자열로 기능을 선택하는 요청은 거부합니다. `/notes/export`, `/notes/:id/export` 등도 허용하지 않습니다.
- 기존 등록 기기 및 위험 신호 기반 추가 인증 규칙은 유지됩니다. 판정기 통과는 실제 API 소유권 검증이나 실제 심판 결과를 대신하지 않습니다.
## 구현 전 확인

1. 규칙이 참일 때만 허용하고 나머지는 거부하거나 추가 확인을 요구합니다.
2. 새로운 `reasonCode`를 쓰려면 운영 등록부와 같은 버전에서 허용 코드가 등록돼야 합니다.
3. 실제 학생 계정, 토큰, 기기 개인키, 자료 본문을 판정 요청·로그·제출 묶음에 넣지 않습니다.
4. 시작 틀의 기본 `decide()`는 모든 요청을 거부합니다. 로컬 연습이 처음에 실패하는 것은 구현 전 상태를 보여 줍니다.

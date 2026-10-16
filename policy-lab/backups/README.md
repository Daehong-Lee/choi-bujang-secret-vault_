# 검증된 사전 정책 사본

이 ZIP에는 침해 전에 보관하고 독립적으로 검증한 정책 사본이 없습니다. 따라서 차이 비교와 복구는 사본이 추가될 때까지 실패 종료합니다.

검증된 백업을 준비할 때 `pre-incident-policy.json`과 `manifest.json`을 이 폴더에 둡니다. manifest 형식은 다음과 같습니다.

```json
{
  "schema": "aleph.verified-policy-backup.v1",
  "backupId": "사전에 발급한 백업 식별자",
  "verified": true,
  "sha256": "pre-incident-policy.json 파일 바이트의 SHA-256"
}
```

`verified: true`는 독립적인 검증을 실제로 수행한 경우에만 사용합니다. 현재 시험 정책을 사전 백업이라고 이름만 바꾸거나, 검증 없이 manifest를 만들지 마세요.

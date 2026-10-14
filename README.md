# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

1단계 당시에는 `/`에서 점령된 가상 자료실을 볼 수 있었고 `/data.json`에 같은 가상 메모가 공개되어 있었습니다. 이 공개 상태가 1단계의 출발점입니다. 2단계에서는 정적 `/data.json` 공개를 제거하고, 가상 메모를 Supabase와 서버 함수 경로로 분리합니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.

## 2단계 자료 조회 함수

2단계에서는 가상 메모를 Supabase의 `public.learning_notes` 테이블에 보관하고, Vercel의 `api/notes.js` 서버 함수가 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY` 환경변수로 자료를 조회합니다. 이 두 키는 브라우저 코드, HTTP 응답, 로그에 포함하지 않습니다. `learning_notes`의 RLS는 켜져 있으며 `anon`과 `authenticated`에는 직접 `SELECT` 권한을 주지 않습니다.

2단계 당시에는 `/api/notes` 함수의 인증 보호가 미완성이었습니다. 이후 단계의 인증·인가 규칙은 아래 단계 기록을 기준으로 확인하며, 과거 설명을 현재 배포 상태로 해석하지 않습니다.

### 8단계: 자료별 자원 구역과 경로 허용 규칙

- `learning_notes.resource_type`으로 `memo`와 `announcement`를 구분합니다. 기존 행과 UUID를 유지하며 메모와 공지는 각각 `/api/notes/:id`, `/api/announcements/:id` 경로에서 구분합니다.
- 판정기는 메모의 `GET /notes/:id`, `PUT /notes/:id`, `DELETE /notes/:id`와 공지의 `GET /announcements`, `GET /announcements/:id`만 허용합니다. ID 없는 메모 목록, 메모 생성, 공지 쓰기, 강사 자료 구역, 미등록 경로는 판정기에서 거부합니다. 가상 심판 ID는 UUID 형식으로 제한하지 않습니다. 별도 메모 생성 API `POST /api/notes`는 검증된 로그인 토큰을 확인하고 서버가 `owner_id`를 설정합니다.
- 판정기는 메모 소유권이나 강사 역할을 대신 판단하지 않습니다. 메모 상세 API는 검증된 로그인 사용자와 DB의 `owner_id`를 비교합니다. 공지 쓰기는 판정기 허용 경로가 아니며, 별도 서버 관리 경로에서만 검증된 강사 신원과 DB 소유권을 확인해야 합니다.
- `aleph.config.json`의 `step`은 8이며 `allowedRoutes`에는 판정기가 허용하는 메서드·경로만 기재합니다. 설정 계약은 `docs/DECIDER_REQUEST.md`를 따릅니다.
- DB 변경이 필요하면 적용 전에 SQL Editor에서 `supabase/migrate_virtual_notes.sql`을 검토·실행합니다. 저장소 수정만으로 실제 DB에 자동 적용되지는 않습니다.
- 화면은 ID 없는 목록 GET을 호출하지 않습니다. 메모 ID로 상세 조회하고, 새 메모는 인증된 `POST /api/notes`로 생성합니다. 상세 API는 로그인과 DB 소유권을 항상 검사하며, 서명된 엔진 컨텍스트가 함께 제공되면 추가 검증합니다. 엔진 컨텍스트가 없는 일반 로그인 요청은 판정기 허용을 의미하지 않습니다. 로컬 테스트만으로 운영 배포나 실제 심판 결과가 입증되지는 않습니다.


### Vercel 환경변수 설정

Supabase 대시보드에서 프로젝트의 URL을 확인하고 서버 전용 Secret Key를 발급한 뒤, Vercel 프로젝트의 **Settings → Environment Variables**에 다음 두 변수만 등록합니다.

- `SUPABASE_URL` — Supabase 프로젝트 URL
- `SUPABASE_SECRET_KEY` — 서버 전용 Secret Key

두 값은 **Production**과 실제 배포에 사용할 환경에 등록합니다. Secret Key 값 자체는 GitHub, 브라우저 코드, `aleph.config.json`, README, API 응답 또는 로그에 넣지 않습니다.

환경변수를 추가하거나 변경한 뒤에는 새 배포가 필요합니다. SQL Editor에서는 `supabase/migrate_virtual_notes.sql`을 실행해 `learning_notes` 테이블과 가상 메모 네 건을 준비합니다.


## 2단계 현재 배포·GitHub 최신 파일 확인 절차

2단계의 자료 보호 여부를 확인할 때는 **현재 배포**와 **GitHub의 최신 커밋**을 각각 검색합니다. 이 검사는 현재 상태만 확인합니다. **옛 공개 커밋과 옛 배포가 남아 있는 동안에는 과거 노출이 해소되었다고 쓰거나 판단하지 않습니다.** 과거 커밋·배포의 노출은 별도로 정리·삭제되고 다시 확인되어야 합니다.

확인 대상인 네 가상 메모 문장은 다음과 같습니다.

```text
실습용 가상 과제 기록
실습용 가상 포트폴리오 기록
실습용 가상 리추얼 기록
실습용 가상 행정 기록
```

### A. 현재 Vercel 배포 확인

배포 주소를 `DEPLOY_URL`에 넣고, 정적 화면과 기존 공개 경로를 확인합니다.

```bash
export DEPLOY_URL="https://본인-배포주소.vercel.app"

for path in / /data.json; do
  echo "===== $path ====="
  curl -sS -L -o /tmp/vault-response -w "HTTP %{http_code}\n" "$DEPLOY_URL$path"
  grep -n -F -e "실습용 가상 과제 기록" \
    -e "실습용 가상 포트폴리오 기록" \
    -e "실습용 가상 리추얼 기록" \
    -e "실습용 가상 행정 기록" \
    /tmp/vault-response || true
done
```

2단계에서 `/data.json`은 정적 자료 경로로 공개되지 않아야 합니다. 따라서 `/data.json`의 응답이 `404`이고 네 문장이 나오지 않는지를 확인합니다. `/`의 HTML에서도 네 문장이 정적으로 들어 있지 않은지 확인합니다.

아래 명령은 2단계 당시 공개 API 상태를 확인하기 위한 역사적 점검 예시입니다. 8단계 정책에서는 ID 없는 메모 목록 GET이 거부되어야 합니다.

```bash
curl -sS "$DEPLOY_URL/api/notes" > /tmp/vault-api-response

grep -n -F -e "실습용 가상 과제 기록" \
  -e "실습용 가상 포트폴리오 기록" \
  -e "실습용 가상 리추얼 기록" \
  -e "실습용 가상 행정 기록" \
  /tmp/vault-api-response || true
```

이 설명은 2단계 당시 동작을 기록한 것입니다. 현재 8단계에서는 `/api/notes`의 ID 없는 GET 요청이 `COLLECTION_ROUTE_DENIED`로 거부되어야 합니다. 운영 배포가 이 정책을 따르는지는 새 배포 후 별도로 확인해야 합니다.

### B. GitHub 최신 파일 확인

로컬 저장소에서 먼저 최신 원격 커밋을 가져옵니다.

```bash
git fetch origin
```

기본 브랜치가 `main`이라면 GitHub 최신 원격 상태에서 네 문장을 검색합니다.

```bash
for phrase in \
  "실습용 가상 과제 기록" \
  "실습용 가상 포트폴리오 기록" \
  "실습용 가상 리추얼 기록" \
  "실습용 가상 행정 기록"; do
  echo "===== $phrase ====="
  git grep -n -F "$phrase" origin/main -- . || true
done
```

검색 결과의 위치를 함께 확인합니다. 2단계의 최신 소스에서는 네 문장이 `supabase/migrate_virtual_notes.sql` 같은 **학습용 데이터 준비 파일**에 존재할 수 있습니다. 반대로 `public/data.json`이 GitHub 최신 상태에 다시 존재하거나, 브라우저에 배포되는 정적 파일에 네 문장이 직접 들어 있다면 2단계 자료 보호가 제대로 적용되지 않은 것입니다.

`origin/main`이 실제 기본 브랜치 이름과 다르면 해당 원격 기본 브랜치 이름으로 바꿉니다.

### C. 확인 결과를 기록할 때의 주의사항

다음과 같이 현재 상태와 과거 상태를 구분해서 기록합니다.

- **현재 배포:** `/data.json`이 공개되지 않는지 확인한다.
- **현재 GitHub 최신 파일:** `public/data.json`이 없고, 정적 공개 파일에 네 문장이 포함되지 않는지 확인한다.
- **2단계 당시 API:** `/api/notes`가 목록을 반환하던 동작은 역사적 기록이며, 8단계의 현재 정책은 ID 없는 GET을 거부한다.
- **과거 공개 커밋:** 과거 커밋에 네 문장이 있었는지는 `git log`와 해당 커밋의 파일을 별도로 확인한다.
- **과거 배포:** 이전 Vercel 배포에 `/data.json` 또는 공개 자료가 남아 있었는지 별도로 확인한다.

따라서 현재 배포와 최신 GitHub 파일의 검색 결과가 깨끗하더라도, **옛 공개 커밋이나 옛 배포가 남아 있다면 "과거 노출 해소"라고 표현하지 않습니다.**

### Supabase Auth 로그인 화면

자료실 화면에는 Supabase 공식 JavaScript SDK의 이메일·비밀번호 로그인과 현재 세션 로그아웃을 연결합니다. 브라우저에서는 **Project URL과 Publishable Key만** 사용하며, 비밀번호를 직접 검증하거나 JWT를 직접 생성하지 않습니다. 로그인은 `supabase.auth.signInWithPassword()`로, 로그아웃은 `supabase.auth.signOut({ scope: 'local' })`로 처리합니다.

`public/auth-config.js`의 다음 두 값에 Supabase 대시보드에서 확인한 공개용 값을 넣습니다.

```js
export const SUPABASE_URL = '[ ]';
export const SUPABASE_PUBLISHABLE_KEY = '[ ]';
```

`SUPABASE_SECRET_KEY`는 이 파일이나 다른 브라우저 파일에 넣지 않습니다. 로그인 실패 시 Supabase가 반환한 오류 이유를 화면에 표시합니다.

로그인 화면만으로 API 권한이 보장되지는 않습니다. 현재 API는 각 요청에서 토큰을 검증하고, 자원별 API에서는 저장된 소유권을 다시 확인해야 합니다. 8단계 정책상 ID 없는 메모 목록 GET은 거부됩니다.

## `device_registered` 규칙 확인 순서

이 단계에서는 별도로 설치할 접속 프로그램이 없습니다. 저장소 폴더에서 아래 명령만 실행합니다.

```bash
npm run decider:test
```

정상 실행 시 다음 두 검사 결과가 모두 표시되어야 합니다.

```text
통과 · 등록 기기의 정상 요청
통과 · 미등록 기기의 가상 요청
이 명령은 가상 요청으로 연습하며 심판 통과 증거가 아닙니다.
```

확인 순서는 다음과 같습니다.

1. `등록 기기의 정상 요청`이 `통과`인지 확인합니다. 등록된 기기의 자료실 읽기 요청은 `allow`여야 합니다.
2. `미등록 기기의 가상 요청`이 `통과`인지 확인합니다. 이 검사에서 판정 응답은 `decision: deny`, `reasonCode: device_not_registered`여야 합니다.
3. 두 결과가 모두 표시되면 로컬 가상 요청 연습을 마칩니다. 이 명령은 실제 미등록 기기 공격을 수행하지 않습니다. 미등록 기기 공격과 실제 접속 판정은 심판이 담당합니다.
# findweb -- 프로젝트 사양

## 개요

`findweb`은 로컬에 설치된 시스템 Chrome 브라우저를 사용해 Google 검색을 수행하는 커맨드라인 도구다. 렌더링된 페이지 DOM에서 자연 검색 결과를 추출해 일반 텍스트 또는 JSON으로 출력한다. 광고 및 트래커 차단은 Ghostery 차단 엔진을 프로그래밍 방식으로 적용하며, 브라우저 확장이나 Chrome Web Store 상호작용이 필요 없다.

## 목표

- 깔끔하고 읽기 쉬운 결과를 반환하는 Google 검색 CLI를 제공한다.
- 번들된 Chromium이 아니라 실제 시스템 Chrome을 사용한다.
- 단일 브라우저 인스턴스와 단일 프로필에서 여러 탭을 열어 배치 검색을 지원한다.
- 프로필의 첫 사용 시 인터랙티브 로그인을 강제해 Google rate limit을 줄인다.
- `hl`, `gl`, `pws` 파라미터를 명시적으로 적용해 개인화와 지역 편향을 줄인다.

## 비목표

- Google Search API 연동 없음.
- CAPTCHA 해결 또는 rate-limit 우회 없음.
- Google 인라인 스폰서 결과의 완전 제거 보장 없음.
- 프록시 로테이션, 계정 풀 관리, 다중 사용자 오케스트레이션 없음.

## 런타임 요구 사항

| 요구 사항 | 값 |
| --- | --- |
| 런타임 | Bun >= 1.3.11 |
| 타입 체커 | `@typescript/native-preview` (`tsgo`) |
| 브라우저 | macOS 시스템 Chrome (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`) |
| 플랫폼 | macOS |

## 기술 스택

| 레이어 | 기술 |
| --- | --- |
| 언어 | TypeScript |
| 런타임 | Bun |
| 타입 체커 | tsgo |
| CLI 프레임워크 | citty |
| 검증 | Zod |
| 브라우저 자동화 | puppeteer-core over CDP |
| 광고 차단 | `@ghostery/adblocker-puppeteer` |
| 테스트 | `bun test` |

## 프로젝트 구조

```text
findweb/
  bin/
    findweb
  docs/
    SPEC.en.md
    SPEC.ko.md
  src/
    index.ts
    cli/
      dispatch.ts
      dispatch.test.ts
      help.ts
      profile.ts
      schema.ts
      schema.test.ts
      format.ts
      types.ts
      flows/
        login.ts
      commands/
        search.ts
        login.ts
    search/
      blocker.ts
      browser.ts
      page.ts
      search.ts
      types.ts
  dist/
  package.json
  tsconfig.json
  bun.lock
```

## 모듈 책임

| 모듈 | 책임 |
| --- | --- |
| `src/index.ts` | 루트 진입점. raw args를 help, search, login으로 디스패치한다. |
| `src/cli/dispatch.ts` | 첫 번째 positional 인자를 보고 help, login, search 중 하나를 결정한다. |
| `src/cli/help.ts` | 루트 도움말 텍스트를 렌더링한다. |
| `src/cli/profile.ts` | `.findweb-profile-ready` 마커 파일을 통해 로컬 프로필 준비 상태를 관리한다. |
| `src/cli/flows/login.ts` | 공용 인터랙티브 로그인 플로우와 첫 실행 로그인 강제 로직을 담당한다. |
| `src/cli/commands/search.ts` | 검색 커맨드 정의와 오케스트레이션을 담당한다. |
| `src/cli/commands/login.ts` | 명시적 로그인 커맨드를 담당한다. |
| `src/cli/schema.ts` | CLI 입력을 Zod로 정규화/검증한다. |
| `src/cli/format.ts` | 일반 텍스트와 JSON 출력 포매팅을 담당한다. |
| `src/search/browser.ts` | 시스템 Chrome을 실행, 연결, 종료한다. |
| `src/search/page.ts` | 헤더 설정, Google 이동, 폼 제출, 결과 추출 등 페이지 레벨 로직을 담당한다. |
| `src/search/search.ts` | 단일 검색, 배치 검색, 로그인 세션 브라우저 플로우를 담당한다. |
| `src/search/blocker.ts` | Ghostery 차단 엔진을 로드하고 캐싱한다. |

## CLI 모델

### 기본 동작

`findweb`은 기본적으로 검색 커맨드처럼 동작한다.

```bash
findweb [options] <query> [query ...]
```

예시:

```bash
findweb "yc"
findweb "yc" "apple" --parallel 2
findweb --json "react useEffect"
findweb login
```

### 검색 모드

- 하나 이상의 positional 쿼리가 필요하다.
- 여러 positional 쿼리를 넘기면 배치 모드가 된다.
- 결과는 항상 입력 순서대로 반환된다.
- `--parallel`이 최대 동시 탭 수를 제어한다.

### 로그인 모드

```bash
findweb login [options]
```

- headed Chrome 창을 연다.
- Google 로그인 페이지로 이동한다.
- 사용자가 브라우저 창을 닫을 때까지 기다린다.
- 프로필 디렉터리 아래 `.findweb-profile-ready` 파일을 써서 준비 완료 상태를 기록한다.

`setup`은 루트 디스패처에서 `login`의 별칭으로 허용된다.

## 검색 옵션

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `<query>` | 필수 | 검색 쿼리, 배치 모드에서는 여러 개 전달 가능 |
| `--gl <country>` | `us` | Google 지역 힌트 |
| `-l, --lang <lang>` | `en` | Google UI 언어 |
| `-n, --num <count>` | `3` | 쿼리당 결과 개수 |
| `--parallel <count>` | `4` | 배치 탭 동시성 |
| `--userDataDir <dir>` | 자동 감지 | Chrome 프로필 디렉터리 |
| `--headed` | `false` | 검색 시 visible Chrome 사용 |
| `--json` | `false` | JSON 출력 |

## 로그인 옵션

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `--gl <country>` | `us` | Google 지역 힌트 |
| `-l, --lang <lang>` | `en` | Google UI 언어 |
| `--userDataDir <dir>` | 자동 감지 | Chrome 프로필 디렉터리 |

## 첫 실행 로그인 강제

이 프로젝트는 준비되지 않은 프로필에 대해 첫 검색 전에 반드시 로그인을 거치게 한다.

### 준비 완료 마커

- 마커 파일: `.findweb-profile-ready`
- 위치: 선택된 `userDataDir` 내부
- 기록자: `src/cli/flows/login.ts`
- 검사자: `src/cli/profile.ts`

### 동작

검색 시작 시:

1. `findweb`가 대상 프로필 디렉터리를 결정한다.
2. `.findweb-profile-ready` 파일 존재 여부를 확인한다.
3. 마커가 있으면 바로 검색을 진행한다.
4. 마커가 없으면 먼저 인터랙티브 로그인 플로우를 연다.
5. Google 로그인 완료가 감지되면 마커 파일을 쓰고 로그인 브라우저를 닫는다.
6. 이후 원래 요청한 검색을 계속 수행한다.

즉, 새 프로필에서의 첫 검색은 사용자가 로그인 흐름을 끝낼 때까지 대기한다.

## 브라우저 생명주기

1. 로컬 빈 TCP 포트를 할당한다.
2. 프로필에 맞는 headless Chrome이 이미 있으면 재사용하고, 없으면 시스템 Chrome을 `--remote-debugging-port=<port>`와 `--user-data-dir=<dir>`로 실행한다.
3. `http://127.0.0.1:<port>/json/version`을 폴링해 CDP 준비 상태를 확인한다.
4. Puppeteer를 `browserURL`로 연결한다.
5. 가능하면 idle 상태의 `about:blank` 탭을 첫 쿼리에 재사용하고, 필요할 때만 추가 탭을 연다.
6. 종료 시 headless Chrome과는 연결만 끊고, 인터랙티브 로그인 세션은 계속 `SIGTERM`으로 종료한다.

## 검색 흐름

쿼리당 동작:

1. 새 탭 생성
2. 공통 페이지 설정 적용
   - viewport: `1440 x 1400`
   - Chrome 유사 user-agent
   - `--lang` 기반 `Accept-Language`
3. Ghostery 차단기 활성화
4. 다음 파라미터로 Google 검색 결과 페이지에 직접 이동
   - `hl=<lang>`
   - `gl=<country>`
   - `pws=0`
5. 검색 결과, 준비된 검색 페이지, 또는 `/sorry/` 중 하나가 보일 때까지 대기
6. 결과 URL에 `/sorry/`가 있으면 실패 처리
10. `a h3`와 주변 카드에서 결과 추출
11. 차단기 비활성화 후 탭 닫기

## 배치 모드

배치 모드는 브라우저 1개와 프로필 1개를 재사용한다.

- 입력 쿼리는 배열로 유지된다.
- 공유 커서가 워커 코루틴에 작업을 분배한다.
- 각 워커는 새 탭을 열어 일반 단일 검색 흐름을 수행한다.
- 결과는 완료 순서와 관계없이 입력 순서대로 정렬된다.

## 광고 차단

Ghostery 차단기는 프리빌트 광고+트래킹 리스트에서 프로세스당 한 번 로드된다.

- 캐시 파일: `~/.cache/google-search/ghostery-engine.bin`
- 로드 방식: lazy singleton
- 적용 범위: 페이지별 활성화, 탭 종료 전 비활성화

이 차단기는 많은 광고/트래커 요청을 줄여주지만, Google 인라인 스폰서 모듈이 항상 사라진다고 보장하지는 않는다.

## Google 검색 파라미터

| 파라미터 | 기본값 | 목적 |
| --- | --- | --- |
| `hl` | `en` | UI 언어 |
| `gl` | `us` | 지역 힌트 |
| `pws` | `0` | 개인화 검색 비활성화 |

이 파라미터는 다음 위치에 적용된다.

- Google 홈 URL
- 검색 폼 hidden 필드
- fallback 직접 검색 URL
- 로그인 플로우 continue URL

## 프로필 관리

- 기본 프로필 경로
  - `${XDG_DATA_HOME:-~/.local/share}/findweb/chrome-profile`
- 환경 변수 오버라이드
  - `GOOGLE_SEARCH_USER_DATA_DIR`
- 준비 완료 마커
  - `.findweb-profile-ready`

중요한 구분:

- **Chrome 프로필**은 쿠키와 브라우저 상태를 저장한다.
- **prepared profile marker**는 해당 프로필에서 인터랙티브 로그인이 완료되었음을 `findweb`에게 알려준다.

## 출력

### 일반 텍스트

단일 쿼리:

```text
1. Y Combinator
https://www.ycombinator.com/
Y Combinator created a new model for funding early stage startups.
```

배치 쿼리:

```text
[yc]
1. Y Combinator
https://www.ycombinator.com/
...

[apple]
1. Apple
https://www.apple.com/
...
```

### JSON

단일 쿼리:

```json
[
  {
    "title": "Y Combinator",
    "url": "https://www.ycombinator.com/",
    "snippet": "Y Combinator created a new model for funding early stage startups."
  }
]
```

배치 쿼리:

```json
[
  {
    "query": "yc",
    "error": null,
    "results": [
      {
        "title": "Y Combinator",
        "url": "https://www.ycombinator.com/",
        "snippet": "..."
      }
    ]
  }
]
```

## 검증

Zod가 보장하는 것:

- `num`, `parallel`은 양의 정수
- `gl`, `lang`, `userDataDir`은 비어 있지 않은 문자열
- `userDataDir`은 절대 경로로 정규화
- 검색에는 최소 하나의 쿼리 필요

잘못된 입력은 사람이 읽을 수 있는 오류 메시지와 함께 종료 코드 `1`을 반환한다.

## 오류 처리

- `/sorry/`는 검색 실패로 처리한다.
- 브라우저 시작 실패는 즉시 중단한다.
- 브라우저 정리는 항상 `finally` 블록에서 수행한다.
- 차단기 비활성화 중 오류는 cleanup 단계에서 무시한다.

## 스크립트

| 스크립트 | 명령 |
| --- | --- |
| `dev` | `bun run ./src/index.ts` |
| `build` | `bun build ./src/index.ts --outdir ./dist --target bun` |
| `start` | `bun run ./dist/index.js` |
| `check` | `tsgo -p tsconfig.json --noEmit` |
| `test` | `bun test` |

## 알려진 제한 사항

- macOS 전용 Chrome 경로 사용
- Google DOM 변경 시 selector가 깨질 수 있음
- 로그인 후에도 fresh/flagged IP는 `/sorry/`를 받을 수 있음
- CAPTCHA 처리 없음
- Google 인라인 sponsored 모듈은 남을 수 있음
- `gl=us`, `hl=en`을 써도 IP 기반 지역화는 남을 수 있음

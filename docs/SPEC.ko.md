# findweb -- 프로젝트 사양

## 개요

`findweb`은 로컬에 설치된 시스템 Chrome 브라우저를 사용해 Google 검색을 수행하는 커맨드라인 도구다. 렌더링된 DOM에서 자연 검색 결과를 추출해 일반 텍스트 또는 JSON으로 반환한다. 광고 및 트래커 차단은 Ghostery 광고 차단 엔진을 통해 프로그래밍 방식으로 적용되며, 브라우저 확장 설치나 사용자 확인이 필요 없다.

## 목표

- 깔끔하고 구조화된 결과를 반환하는 Google 검색 CLI 인터페이스를 제공한다.
- 봇이나 헤드리스 스크래퍼로 감지되지 않도록 실제 시스템 Chrome 바이너리(`/Applications/Google Chrome.app`)를 사용한다.
- Chrome 확장 없이 네트워크/코스메틱 수준에서 광고와 트래커를 차단한다.
- 단일 브라우저 인스턴스와 프로필에서 여러 탭을 열어 배치 검색을 지원한다.
- `hl`, `gl`, `pws` 파라미터를 명시적으로 설정해 개인화 및 지역 편향을 최소화한다.

## 비목표

- Google Search API를 사용하지 않는다.
- CAPTCHA 우회를 시도하지 않는다. Google이 `/sorry/` 페이지를 반환하면 검색은 정상적으로 실패 처리된다.
- 광고 100% 제거를 보장하지 않는다. Ghostery 필터 목록이 대부분의 경우를 처리하지만, Google SERP 광고가 가끔 나타날 수 있다.
- 다중 Google 계정 관리나 프록시 로테이션을 지원하지 않는다.

## 요구 사항

| 요구 사항               | 버전 / 값                                              |
| ----------------------- | ------------------------------------------------------ |
| 런타임                  | Bun >= 1.3.11                                          |
| 타입 체커               | `@typescript/native-preview` (tsgo) >= 7.0.0-dev       |
| 시스템 Chrome           | macOS `/Applications/Google Chrome.app` (브랜드 Chrome) |
| 플랫폼                  | macOS (Chrome 바이너리 경로 하드코딩)                   |

## 기술 스택

| 레이어         | 기술                                                          |
| -------------- | ------------------------------------------------------------- |
| 언어           | TypeScript (strict, ES2022, NodeNext 모듈)                    |
| 런타임         | Bun                                                           |
| 타입 체커      | tsgo (`@typescript/native-preview`)                           |
| CLI 프레임워크 | citty                                                         |
| 검증           | Zod 4                                                         |
| 브라우저 드라이버 | puppeteer-core (`--remote-debugging-port` 경유 CDP 연결)   |
| 광고 차단기    | `@ghostery/adblocker-puppeteer` (프리빌트 광고+트래킹 목록)   |
| 테스트 러너    | `bun test`                                                    |

## 아키텍처

### 디렉터리 구조

```
findweb/
  docs/
    SPEC.en.md
    SPEC.ko.md
  src/
    index.ts              # 진입점: 검색 또는 로그인으로 디스패치
    cli/
      dispatch.ts         # 루트 인자 디스패처 (검색 vs 로그인 vs 도움말)
      dispatch.test.ts    # 디스패처 단위 테스트
      help.ts             # 루트 도움말 텍스트 렌더러
      types.ts            # CLI 레이어 타입 정의
      schema.ts           # 입력 정규화/검증용 Zod 스키마
      schema.test.ts      # 스키마 정규화 단위 테스트
      format.ts           # 일반 텍스트 및 JSON 출력 포매팅
      commands/
        search.ts         # 검색 커맨드 정의
        login.ts          # 로그인 커맨드 정의
    search/
      types.ts            # 검색 레이어 타입 정의
      browser.ts          # 시스템 Chrome 생명주기 (실행, 연결, 종료)
      page.ts             # 페이지 수준 작업 (탐색, 제출, 추출)
      search.ts           # 단일 쿼리 및 배치 검색 오케스트레이션
      blocker.ts          # Ghostery 광고 차단 엔진 로드 및 캐싱
  bin/
    findweb               # npm bin 진입점
  dist/                   # 빌드 출력 (bun build)
  package.json
  tsconfig.json
  bun.lock
```

### 모듈 책임

| 모듈                     | 책임                                                           |
| ------------------------ | -------------------------------------------------------------- |
| `src/index.ts`           | 진입점. raw args를 검색, 로그인, 도움말로 디스패치한다.        |
| `cli/dispatch.ts`        | 첫 번째 positional 인자를 검사해 검색, 로그인, 도움말 중 하나로 판별한다. |
| `cli/help.ts`            | 쿼리가 제공되지 않았을 때 표시되는 루트 도움말 텍스트를 렌더링한다. |
| `cli/commands/search.ts` | citty args로 검색 커맨드를 정의한다. Zod로 입력을 정규화하고, 브라우저를 실행하고, 배치 검색을 수행하고, 결과를 출력하고, 브라우저를 닫는다. |
| `cli/commands/login.ts`  | 로그인 커맨드를 정의한다. Google 로그인 페이지가 열린 headed Chrome을 연다. 사용자가 창을 닫을 때까지 대기한다. |
| `cli/schema.ts`          | raw CLI 입력을 타입이 지정된 옵션으로 검증하고 변환하는 Zod 스키마. `gl`, `lang`, `num`, `parallel`, `userDataDir`의 기본값을 처리한다. |
| `cli/format.ts`          | 검색 결과를 일반 텍스트 또는 JSON으로 포매팅하여 stdout에 출력한다. |
| `cli/types.ts`           | CLI 레이어 옵션 및 출력 가능한 결과의 TypeScript 타입.         |
| `search/types.ts`        | 검색 레이어 전반에서 공유되는 TypeScript 타입.                 |
| `search/browser.ts`      | `--remote-debugging-port`로 시스템 Chrome을 생성하고, 빈 포트를 찾고, CDP 준비를 대기하고, Puppeteer를 연결하고, 종료 시 정리한다. |
| `search/page.ts`         | 페이지 수준 헬퍼: user-agent/헤더 설정, Google 홈으로 이동, DOM 조작을 통한 검색 쿼리 제출, 렌더링된 HTML에서 결과 추출. |
| `search/search.ts`       | 단일 및 배치 검색을 오케스트레이션한다. 쿼리당 새 탭을 열고, Ghostery 차단기를 적용하고, 탐색하고, 결과를 추출하고, 탭을 닫는다. 배치 모드는 워커 기반 동시성을 위해 공유 커서를 사용한다. |
| `search/blocker.ts`      | Ghostery 프리빌트 광고+트래킹 엔진을 로드한다. 직렬화된 엔진 바이너리를 `~/.cache/google-search/ghostery-engine.bin`에 캐싱한다. 싱글톤 -- 프로세스당 한 번 로드된다. |

## CLI 인터페이스

### 기본 동작

```
findweb [options] <query> [query ...]
```

하나 이상의 positional 인자와 함께 실행하면 Google 검색을 수행한다. 인자 없이 또는 플래그만으로 실행하면 사용법을 출력한다.

### 로그인 커맨드

```
findweb login [options]
```

Google 로그인 페이지가 열린 visible (headed) Chrome 창을 연다. 사용자가 수동으로 로그인한 후 브라우저를 닫는다. 결과 프로필(쿠키, 세션)은 `--userDataDir`에 저장되어 재사용된다.

`setup`은 `login`의 별칭으로 허용된다.

### 검색 옵션

| 옵션               | 타입    | 기본값                       | 설명                                 |
| ------------------ | ------- | ---------------------------- | ------------------------------------ |
| `<query>`          | positional | (필수, 최소 1개)          | 검색 쿼리. 배치 모드는 반복 가능.    |
| `--gl`             | string  | `us`                         | Google 지역 힌트 (`gl` 파라미터).    |
| `-l`, `--lang`     | string  | `en`                         | Google UI 언어 (`hl` 파라미터).      |
| `-n`, `--num`      | integer | `3`                          | 쿼리당 최대 결과 수.                 |
| `--parallel`       | integer | `4`                          | 배치 시 최대 동시 탭 수.             |
| `--userDataDir`    | string  | 자동 감지                    | Chrome 프로필 디렉터리.              |
| `--headed`         | boolean | `false`                      | Chrome 창을 표시한다.                |
| `--json`           | boolean | `false`                      | JSON으로 출력한다.                   |

### 로그인 옵션

| 옵션               | 타입   | 기본값         | 설명                                 |
| ------------------ | ------ | -------------- | ------------------------------------ |
| `--gl`             | string | `us`           | Google 지역 힌트.                    |
| `-l`, `--lang`     | string | `en`           | Google UI 언어.                      |
| `--userDataDir`    | string | 자동 감지      | Chrome 프로필 디렉터리.              |

### 종료 코드

- `0` -- 모든 쿼리가 성공했다.
- `1` -- 하나 이상의 쿼리가 실패했다.

## 브라우저 생명주기

1. **포트 할당.** `127.0.0.1`의 포트 `0`에 바인딩하여 빈 TCP 포트를 찾는다.
2. **Chrome 생성.** 시스템 Chrome을 `--remote-debugging-port=<port>`, `--user-data-dir=<dir>`, `--headless=new`(`--headed`가 아닌 경우)로 자식 프로세스로 실행한다. Puppeteer가 관리하는 Chromium은 사용하지 않는다.
3. **CDP 연결.** Chrome이 준비될 때까지 `http://127.0.0.1:<port>/json/version`을 폴링한다(최대 30초). 이후 `puppeteer.connect({ browserURL })`로 연결한다.
4. **검색 실행.** 각 쿼리는 새 탭을 열고, Ghostery 차단기를 적용하고, Google로 이동하고, 쿼리를 제출하고, 결과를 기다리고, DOM에서 데이터를 추출한 후 탭을 닫는다.
5. **정리.** 모든 쿼리가 완료되면(또는 오류 발생 시) Puppeteer 연결을 닫고 Chrome을 `SIGTERM`으로 종료한다.

## 검색 흐름 (쿼리당)

1. **페이지 준비.** 뷰포트(1440x1400), user-agent(macOS의 Chrome 146), `--lang`에서 파생된 `Accept-Language` 헤더를 설정한다.
2. **광고 차단기 활성화.** `blocker.enableBlockingInPage(page)` -- 네트워크 요청을 가로채고 코스메틱 필터를 주입한다.
3. **Google로 이동.** `https://www.google.com/?hl=<lang>&gl=<gl>&pws=0`.
4. **유휴 대기.** `networkidle2` + 700ms 유휴 구간.
5. **쿼리 제출.** React 호환 `descriptor.set()`을 통해 프로그래밍 방식으로 검색 입력값을 설정하고, 숨겨진 `hl`/`gl`/`pws` 필드를 주입하고, 폼을 제출한다.
6. **차단 확인.** 결과 URL에 `/sorry/`가 포함되면 쿼리를 실패로 표시한다.
7. **결과 추출.** 렌더링된 DOM의 `<a> <h3>` 요소를 순회한다. 각 결과에 대해:
   - `<h3>` 내부 텍스트에서 제목을 추출한다.
   - 부모 `<a>` href에서 URL을 추출한다.
   - 가장 가까운 카드 컨테이너의 내부 텍스트에서 스니펫을 찾되, 20자 이상인 줄을 우선한다.
   - Google 내부 링크, 중복, "About this result" 같은 메타 텍스트는 건너뛴다.
8. **정리.** 페이지에서 차단기를 비활성화하고 탭을 닫는다.

## 배치 모드

배치 모드는 단일 브라우저 인스턴스와 Chrome 프로필을 재사용한다. `--parallel` 제한까지 여러 탭을 동시에 연다.

- 공유 원자적 커서(`{ value: number }`)가 워커 코루틴에 쿼리를 분배한다.
- 각 워커는 다음 미처리 쿼리 인덱스를 가져와 새 탭에서 전체 검색 흐름을 실행하고 결과를 저장한다.
- 결과는 완료 순서와 관계없이 입력 순서대로 반환된다.

## 광고 차단

Ghostery 광고 차단 엔진(`@ghostery/adblocker-puppeteer`)은 프리빌트 필터 목록(광고 + 트래킹)에서 프로세스당 한 번 로드된다. 직렬화된 엔진은 `~/.cache/google-search/ghostery-engine.bin`에 캐싱된다.

이 접근 방식:
- Chrome 확장이 필요 없고 사용자 확인도 필요 없다.
- 헤드리스와 headed 모드 모두에서 동작한다.
- 네트워크 수준의 광고/트래커 요청을 차단하고 코스메틱 숨김 규칙을 적용한다.
- Google SERP의 "Sponsored" 결과는 DOM에 인라인으로 렌더링되므로 완전한 제거를 보장하지 않는다.

## Google 검색 파라미터

| 파라미터  | 기본값 | 목적                                       |
| --------- | ------ | ------------------------------------------ |
| `hl`      | `en`   | Google UI 언어.                            |
| `gl`      | `us`   | 결과 순위를 위한 지역 힌트.                |
| `pws`     | `0`    | 개인화된 검색 결과를 비활성화한다.          |

이 파라미터들은 Google 홈 URL에 적용되고, 제출 시 숨겨진 폼 필드로 주입되며, 폴백 직접 탐색 URL에도 포함된다.

## 프로필 관리

- 기본 프로필 디렉터리는 `/tmp/google-search-profile`이며, `/tmp/gsearch-manual-login-profile`이 이미 존재하면 이를 사용한다.
- 환경 변수 `GOOGLE_SEARCH_USER_DATA_DIR`이 기본값을 재정의한다.
- `login` 커맨드는 재사용 가능한 로그인된 프로필을 생성한다. 로그인하면 Google 속도 제한(`/sorry/` 페이지) 가능성이 줄어든다.
- 기존 쿠키가 있는 로그인된 프로필은 새 빈 프로필보다 훨씬 안정적이다.

## 입력 검증

모든 CLI 입력은 실행 전 Zod 스키마를 통해 검증된다:

- `num`과 `parallel`은 양의 정수여야 한다.
- `gl`과 `lang`은 비어 있지 않은 문자열이어야 한다.
- `userDataDir`은 비어 있지 않은 문자열이어야 하며, 절대 경로로 해석된다.
- 검색에는 최소 하나의 쿼리가 필요하다.
- 잘못된 입력은 사람이 읽을 수 있는 오류 메시지를 생성하고 종료 코드 `1`로 종료한다.

## 오류 처리

- Google `/sorry/` 페이지는 탐색 후 페이지 URL을 확인하여 감지한다. 쿼리는 설명적인 오류 메시지와 함께 실패로 표시된다.
- Chrome 실행 실패(예: 30초 내 포트 미준비, Chrome 조기 종료)는 즉시 예외를 발생시킨다.
- 브라우저 정리(`closeSearchBrowser`)는 오류 발생 시에도 `finally` 블록에서 항상 실행된다.
- Ghostery 차단기의 `disableBlockingInPage`는 `finally` 블록에서 호출되며 오류를 삼킨다.

## 스크립트

| 스크립트     | 명령                                                 |
| ------------ | ---------------------------------------------------- |
| `dev`        | `bun run ./src/index.ts`                              |
| `build`      | `bun build ./src/index.ts --outdir ./dist --target bun` |
| `start`      | `bun run ./dist/index.js`                             |
| `check`      | `tsgo -p tsconfig.json --noEmit`                      |
| `test`       | `bun test`                                            |

## 알려진 제한 사항

- **macOS 전용.** Chrome 바이너리 경로가 `/Applications/Google Chrome.app`으로 하드코딩되어 있다.
- **Google DOM 변경.** 결과 추출은 언제든 변경될 수 있는 CSS 선택자(`.N54PNb`, `.tF2Cxc`, `.MjjYud`, `.g`, `.ezO2md`, `a h3`)에 의존한다.
- **속도 제한.** Google은 빠르거나 동시적인 검색에 대해 `/sorry/` 페이지를 제공할 수 있으며, 특히 새 프로필이나 플래그된 IP에서 그렇다. 로그인된 프로필이 이를 완화한다.
- **CAPTCHA 미해결.** Google이 CAPTCHA를 요구하면 검색이 실패한다.
- **불완전한 광고 제거.** Google의 인라인 "Sponsored" 결과는 Ghostery 필터 목록으로 완전히 차단되지 않을 수 있다.
- **IP 기반 지역화.** `gl=us`와 `hl=en`을 설정해도 클라이언트의 IP 주소에 따라 Google이 지역적으로 관련된 결과를 섞을 수 있다.

# findweb -- Project Specification

## Overview

`findweb` is a command-line Google search tool that uses the locally installed system Chrome browser. It renders real Google pages, extracts organic results from the DOM, and prints them as plain text or JSON. Ads and trackers are blocked programmatically with the Ghostery blocker engine, so the tool does not require any browser extension or Chrome Web Store interaction.

## Goals

- Provide a practical Google search CLI with clean, readable output.
- Use the real system Chrome binary instead of bundled Chromium.
- Support batch searches by reusing one browser instance and one profile across multiple tabs.
- Reduce Google rate limiting by forcing an interactive login on first use of a profile.
- Minimize result drift with explicit `hl`, `gl`, and `pws` parameters.

## Non-Goals

- No Google Search API integration.
- No CAPTCHA solving or rate-limit bypass.
- No complete guarantee that Google inline sponsored results will disappear.
- No proxy rotation, account pool management, or multi-user orchestration.

## Runtime Requirements

| Requirement   | Value |
| --- | --- |
| Runtime | Bun >= 1.3.11 |
| Type checker | `@typescript/native-preview` (`tsgo`) |
| Browser | macOS system Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| Platform | macOS |

## Tech Stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript |
| Runtime | Bun |
| Type checker | tsgo |
| CLI framework | citty |
| Validation | Zod |
| Browser automation | puppeteer-core over CDP |
| Ad blocking | `@ghostery/adblocker-puppeteer` |
| Tests | `bun test` |

## Project Layout

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

## Module Responsibilities

| Module | Responsibility |
| --- | --- |
| `src/index.ts` | Root entry point. Dispatches raw args to help, search, or login. |
| `src/cli/dispatch.ts` | Decides whether the invocation is root help, login, or search based on the first positional arg. |
| `src/cli/help.ts` | Renders root usage text. |
| `src/cli/profile.ts` | Manages local profile preparation state via `.findweb-profile-ready`. |
| `src/cli/flows/login.ts` | Shared interactive login flow and first-run login enforcement. |
| `src/cli/commands/search.ts` | Search command definition and orchestration. |
| `src/cli/commands/login.ts` | Explicit login command definition. |
| `src/cli/schema.ts` | Zod normalization and validation for search/login options. |
| `src/cli/format.ts` | Plain-text and JSON result formatting. |
| `src/search/browser.ts` | Launches, connects to, and closes system Chrome. |
| `src/search/page.ts` | Page-level helpers: headers, navigation, form submission, result extraction. |
| `src/search/search.ts` | Single-query search, batch search, and login-session browser flow. |
| `src/search/blocker.ts` | Loads and caches the Ghostery blocker engine. |

## CLI Model

### Root Behavior

`findweb` treats the default invocation as search.

```bash
findweb [options] <query> [query ...]
```

Examples:

```bash
findweb "yc"
findweb "yc" "apple" --parallel 2
findweb --json "react useEffect"
findweb login
```

### Search Mode

- One or more positional query strings are required.
- Multiple positional queries trigger batch mode.
- Search results are returned in input order.
- `--parallel` controls maximum concurrent tabs.

### Login Mode

```bash
findweb login [options]
```

- Opens a headed Chrome window.
- Navigates to the Google sign-in flow.
- Waits until the browser window is closed.
- Marks the profile as prepared by writing `.findweb-profile-ready` under the profile directory.

`setup` is accepted as an alias for `login` by the root dispatcher.

## Search Options

| Option | Default | Description |
| --- | --- | --- |
| `<query>` | required | Search query; repeat for batch mode |
| `--gl <country>` | `us` | Google region hint |
| `-l, --lang <lang>` | `en` | Google UI language |
| `-n, --num <count>` | `3` | Results per query |
| `--parallel <count>` | `4` | Batch tab concurrency |
| `--userDataDir <dir>` | auto-detected | Chrome profile directory |
| `--headed` | `false` | Run visible Chrome during search |
| `--json` | `false` | Print JSON instead of plain text |

## Login Options

| Option | Default | Description |
| --- | --- | --- |
| `--gl <country>` | `us` | Google region hint |
| `-l, --lang <lang>` | `en` | Google UI language |
| `--userDataDir <dir>` | auto-detected | Chrome profile directory |

## First-Run Login Enforcement

This project now forces login for any profile that has not been explicitly prepared.

### Prepared Profile Marker

- Marker file: `.findweb-profile-ready`
- Location: inside the selected `userDataDir`
- Writer: `src/cli/flows/login.ts`
- Reader: `src/cli/profile.ts`

### Behavior

When a search starts:

1. `findweb` resolves the target profile directory.
2. It checks for `.findweb-profile-ready`.
3. If the marker exists, search continues immediately.
4. If the marker does not exist, `findweb` opens the interactive login flow first.
5. After Google sign-in is detected, `findweb` writes the marker and closes the login browser.
6. The original search then continues.

This means the first search on a fresh profile blocks until the user completes the login flow.

## Browser Lifecycle

1. Allocate a free local TCP port.
2. Reuse an existing headless Chrome for the profile when available; otherwise spawn system Chrome with `--remote-debugging-port=<port>` and `--user-data-dir=<dir>`.
3. Poll `http://127.0.0.1:<port>/json/version` until CDP is ready.
4. Connect Puppeteer with `browserURL`.
5. Reuse an idle `about:blank` tab for the first query when possible, then open extra tabs as needed.
6. Disconnect from headless Chrome when finished; interactive login sessions still terminate Chrome via `SIGTERM`.

## Search Flow

For each query:

1. Create a new tab.
2. Apply common page setup:
   - viewport: `1440 x 1400`
   - Chrome-like user agent
   - `Accept-Language` derived from `--lang`
3. Enable Ghostery blocking for the page.
4. Navigate directly to Google search results with:
   - `hl=<lang>`
   - `gl=<country>`
   - `pws=0`
5. Wait until either search results, a ready search page, or `/sorry/` is visible.
6. If the destination URL contains `/sorry/`, fail the query.
10. Extract results from `a h3` nodes and surrounding card containers.
11. Disable blocking and close the tab.

## Batch Mode

Batch mode uses one browser and one profile.

- Queries are stored in an input array.
- A shared cursor assigns work to worker coroutines.
- Each worker opens a fresh tab, runs the normal single-query flow, and stores its result.
- Output preserves the original query order.

## Ad Blocking

The Ghostery blocker is loaded once per process from prebuilt ads-and-tracking lists.

- Cache file: `~/.cache/google-search/ghostery-engine.bin`
- Load strategy: lazy singleton
- Scope: enabled per page, disabled before tab close

The blocker reduces many ad and tracker requests, but Google inline sponsored modules are not guaranteed to disappear in every case.

## Google Query Parameters

| Parameter | Default | Purpose |
| --- | --- | --- |
| `hl` | `en` | UI language |
| `gl` | `us` | Region hint |
| `pws` | `0` | Disable personalized search |

These are applied to:

- the Google home URL
- hidden fields injected into the search form
- the fallback direct search URL
- the login flow continue URL

## Profile Management

- Default profile path:
  - `${XDG_DATA_HOME:-~/.local/share}/findweb/chrome-profile`
- Environment override:
  - `GOOGLE_SEARCH_USER_DATA_DIR`
- Prepared profile marker:
  - `.findweb-profile-ready`

Important distinction:

- A **Chrome profile** stores cookies and browser state.
- A **prepared profile marker** tells `findweb` that interactive login has already been completed for that profile.

## Output

### Plain Text

Single query:

```text
1. Y Combinator
https://www.ycombinator.com/
Y Combinator created a new model for funding early stage startups.
```

Batch query:

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

Single query:

```json
[
  {
    "title": "Y Combinator",
    "url": "https://www.ycombinator.com/",
    "snippet": "Y Combinator created a new model for funding early stage startups."
  }
]
```

Batch query:

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

## Validation

Zod enforces:

- positive integers for `num` and `parallel`
- non-empty strings for `gl`, `lang`, and `userDataDir`
- absolute-path normalization for `userDataDir`
- at least one query for search mode

Invalid input exits with code `1` and a human-readable error message.

## Error Handling

- `/sorry/` is treated as a query failure.
- Browser startup failures abort immediately.
- Browser cleanup always runs in `finally` blocks.
- Blocker disable errors are ignored during cleanup.

## Scripts

| Script | Command |
| --- | --- |
| `dev` | `bun run ./src/index.ts` |
| `build` | `bun build ./src/index.ts --outdir ./dist --target bun` |
| `start` | `bun run ./dist/index.js` |
| `check` | `tsgo -p tsconfig.json --noEmit` |
| `test` | `bun test` |

## Known Limitations

- macOS-only Chrome path.
- Google DOM changes can break selectors.
- Fresh or flagged IPs can still trigger `/sorry/` even after login.
- No CAPTCHA handling.
- Inline Google sponsored modules may still appear.
- Even with `gl=us` and `hl=en`, IP-based localization may still affect ranking.

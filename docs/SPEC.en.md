# findweb -- Project Specification

## Overview

`findweb` is a command-line tool that performs Google searches using the locally installed system Chrome browser. It extracts organic search results from the rendered DOM and returns them as plain text or JSON. Ad and tracker blocking is applied programmatically through the Ghostery adblocker engine -- no browser extension installation or user confirmation is required.

## Goals

- Provide a CLI interface for Google Search that returns clean, structured results.
- Use the real system Chrome binary (`/Applications/Google Chrome.app`) to avoid detection as a bot or headless scraper.
- Block ads and trackers at the network/cosmetic level without requiring any Chrome extension.
- Support batch searches by opening multiple tabs in a single browser instance and profile.
- Minimize personalization and regional bias in results through explicit `hl`, `gl`, and `pws` parameters.

## Non-Goals

- This tool does not use the Google Search API.
- It does not attempt to bypass CAPTCHAs. If Google returns a `/sorry/` page, the search fails gracefully.
- It does not guarantee 100% ad removal. The Ghostery filter lists handle most cases, but Google SERP ads may occasionally appear.
- It does not manage multiple Google accounts or proxy rotation.

## Requirements

| Requirement             | Version / Value                                          |
| ----------------------- | -------------------------------------------------------- |
| Runtime                 | Bun >= 1.3.11                                            |
| Type checker            | `@typescript/native-preview` (tsgo) >= 7.0.0-dev         |
| System Chrome           | macOS `/Applications/Google Chrome.app` (branded Chrome)  |
| Platform                | macOS (hardcoded Chrome binary path)                      |

## Tech Stack

| Layer          | Technology                                                    |
| -------------- | ------------------------------------------------------------- |
| Language       | TypeScript (strict, ES2022, NodeNext modules)                 |
| Runtime        | Bun                                                           |
| Type checker   | tsgo (`@typescript/native-preview`)                           |
| CLI framework  | citty                                                         |
| Validation     | Zod 4                                                         |
| Browser driver | puppeteer-core (connects via CDP over `--remote-debugging-port`) |
| Ad blocker     | `@ghostery/adblocker-puppeteer` (prebuilt ads + tracking lists) |
| Test runner    | `bun test`                                                    |

## Architecture

### Directory Structure

```
findweb/
  docs/
    SPEC.en.md
    SPEC.ko.md
  src/
    index.ts              # Entry point: dispatches to search or login
    cli/
      dispatch.ts         # Root argument dispatcher (search vs login vs help)
      dispatch.test.ts    # Unit tests for dispatcher
      help.ts             # Root help text renderer
      types.ts            # CLI-layer type definitions
      schema.ts           # Zod schemas for input normalization/validation
      schema.test.ts      # Unit tests for schema normalization
      format.ts           # Plain text and JSON output formatting
      commands/
        search.ts         # Search command definition
        login.ts          # Login command definition
    search/
      types.ts            # Search-layer type definitions
      browser.ts          # System Chrome lifecycle (launch, connect, close)
      page.ts             # Page-level operations (navigate, submit, extract)
      search.ts           # Single-query and batch search orchestration
      blocker.ts          # Ghostery adblocker engine loading and caching
  bin/
    findweb               # npm bin entry point
  dist/                   # Build output (bun build)
  package.json
  tsconfig.json
  bun.lock
```

### Module Responsibilities

| Module                   | Responsibility                                                     |
| ------------------------ | ------------------------------------------------------------------ |
| `src/index.ts`           | Entry point. Dispatches raw args to search, login, or help.        |
| `cli/dispatch.ts`        | Determines whether the invocation is a search, login, or help request by inspecting the first positional argument. |
| `cli/help.ts`            | Renders the root help text shown when no query is provided.        |
| `cli/commands/search.ts` | Defines the search command with citty args. Normalizes input through Zod, launches browser, runs batch search, prints results, closes browser. |
| `cli/commands/login.ts`  | Defines the login command. Opens a headed Chrome with Google sign-in page. Waits for the user to close the window. |
| `cli/schema.ts`          | Zod schemas that validate and coerce raw CLI input into typed options. Handles defaults for `gl`, `lang`, `num`, `parallel`, `userDataDir`. |
| `cli/format.ts`          | Formats search outcomes as plain text or JSON for stdout.          |
| `cli/types.ts`           | TypeScript types for CLI-layer options and printable results.      |
| `search/types.ts`        | TypeScript types shared across the search layer.                   |
| `search/browser.ts`      | Spawns system Chrome with `--remote-debugging-port`, finds a free port, waits for CDP readiness, connects Puppeteer, and cleans up on close. |
| `search/page.ts`         | Page-level helpers: set user-agent/headers, navigate to Google home, submit a search query via DOM manipulation, extract results from rendered HTML. |
| `search/search.ts`       | Orchestrates single and batch searches. Opens a new tab per query, applies the Ghostery blocker, navigates, extracts results, and closes the tab. Batch mode uses a shared cursor for worker-based concurrency. |
| `search/blocker.ts`      | Loads the Ghostery prebuilt ads-and-tracking engine. Caches the serialized engine binary to `~/.cache/google-search/ghostery-engine.bin`. Singleton -- loaded once per process. |

## CLI Interface

### Default Behavior

```
findweb [options] <query> [query ...]
```

When invoked with one or more positional arguments, performs a Google search. When invoked with no arguments or only flags, prints usage.

### Login Command

```
findweb login [options]
```

Opens a visible (headed) Chrome window with the Google sign-in page. The user signs in manually, then closes the browser. The resulting profile (cookies, session) is saved to `--userDataDir` for reuse.

`setup` is accepted as an alias for `login`.

### Search Options

| Option             | Type    | Default                      | Description                          |
| ------------------ | ------- | ---------------------------- | ------------------------------------ |
| `<query>`          | positional | (required, at least one)  | Search query. Repeat for batch mode. |
| `--gl`             | string  | `us`                         | Google region hint (`gl` parameter). |
| `-l`, `--lang`     | string  | `en`                         | Google UI language (`hl` parameter). |
| `-n`, `--num`      | integer | `3`                          | Maximum results per query.           |
| `--parallel`       | integer | `4`                          | Maximum concurrent tabs for batch.   |
| `--userDataDir`    | string  | auto-detected                | Chrome profile directory.            |
| `--headed`         | boolean | `false`                      | Show the Chrome window.              |
| `--json`           | boolean | `false`                      | Print output as JSON.                |

### Login Options

| Option             | Type   | Default        | Description                          |
| ------------------ | ------ | -------------- | ------------------------------------ |
| `--gl`             | string | `us`           | Google region hint.                  |
| `-l`, `--lang`     | string | `en`           | Google UI language.                  |
| `--userDataDir`    | string | auto-detected  | Chrome profile directory.            |

### Exit Codes

- `0` -- all queries succeeded.
- `1` -- one or more queries failed.

## Browser Lifecycle

1. **Port allocation.** A free TCP port is found by binding to port `0` on `127.0.0.1`.
2. **Chrome spawn.** System Chrome is launched as a child process with `--remote-debugging-port=<port>`, `--user-data-dir=<dir>`, and `--headless=new` (unless `--headed`). No Puppeteer-managed Chromium is used.
3. **CDP connection.** The tool polls `http://127.0.0.1:<port>/json/version` until Chrome is ready (up to 30 seconds), then connects Puppeteer via `puppeteer.connect({ browserURL })`.
4. **Search execution.** Each query opens a new tab, applies the Ghostery blocker, navigates to Google, submits the query, waits for results, extracts data from the DOM, then closes the tab.
5. **Cleanup.** After all queries complete (or on error), the Puppeteer connection is closed and Chrome is terminated via `SIGTERM`.

## Search Flow (per query)

1. **Page preparation.** Set viewport (1440x1400), user-agent (Chrome 146 on macOS), and `Accept-Language` header derived from `--lang`.
2. **Ad blocker activation.** `blocker.enableBlockingInPage(page)` -- intercepts network requests and injects cosmetic filters.
3. **Navigate to Google.** `https://www.google.com/?hl=<lang>&gl=<gl>&pws=0`.
4. **Wait for idle.** `networkidle2` + 700ms idle window.
5. **Submit query.** Programmatically sets the search input value via React-compatible `descriptor.set()`, injects hidden `hl`/`gl`/`pws` fields, and submits the form.
6. **Check for block.** If the resulting URL contains `/sorry/`, the query is marked as failed.
7. **Extract results.** Iterates `<a> <h3>` elements in the rendered DOM. For each result:
   - Extracts title from `<h3>` inner text.
   - Extracts URL from the parent `<a>` href.
   - Finds a snippet from the nearest card container's inner text, preferring lines >= 20 characters.
   - Skips Google-internal links, duplicates, and meta text like "About this result".
8. **Cleanup.** Disables blocker in page, closes the tab.

## Batch Mode

Batch mode reuses a single browser instance and Chrome profile. Multiple tabs are opened concurrently up to the `--parallel` limit.

- A shared atomic cursor (`{ value: number }`) distributes queries across worker coroutines.
- Each worker picks the next unprocessed query index, runs the full search flow in a new tab, and stores the result.
- Results are returned in input order regardless of completion order.

## Ad Blocking

The Ghostery adblocker engine (`@ghostery/adblocker-puppeteer`) is loaded once per process from prebuilt filter lists (ads + tracking). The serialized engine is cached at `~/.cache/google-search/ghostery-engine.bin`.

This approach:
- Requires no Chrome extension and no user confirmation.
- Works in both headless and headed mode.
- Blocks network-level ad/tracker requests and applies cosmetic hiding rules.
- Does not guarantee complete removal of Google SERP "Sponsored" results, as those are rendered inline in the DOM.

## Google Search Parameters

| Parameter | Default | Purpose                                    |
| --------- | ------- | ------------------------------------------ |
| `hl`      | `en`    | Google UI language.                        |
| `gl`      | `us`    | Region hint for result ranking.            |
| `pws`     | `0`     | Disable personalized search results.       |

These are applied to the Google home URL, injected as hidden form fields on submit, and included in fallback direct-navigation URLs.

## Profile Management

- The default profile directory is `/tmp/google-search-profile`, or `/tmp/gsearch-manual-login-profile` if it already exists.
- The environment variable `GOOGLE_SEARCH_USER_DATA_DIR` overrides the default.
- The `login` command creates a reusable signed-in profile. Signing in reduces the likelihood of Google rate-limiting (`/sorry/` pages).
- A signed-in profile with existing cookies is significantly more stable than a fresh empty profile.

## Input Validation

All CLI input is validated through Zod schemas before execution:

- `num` and `parallel` must be positive integers.
- `gl` and `lang` must be non-empty strings.
- `userDataDir` must be a non-empty string, resolved to an absolute path.
- At least one query is required for search.
- Invalid input produces a human-readable error message and exits with code `1`.

## Error Handling

- Google `/sorry/` pages are detected by checking the page URL after navigation. The query is marked as failed with a descriptive error message.
- Chrome launch failures (e.g., port not ready within 30 seconds, Chrome exits prematurely) throw immediately.
- Browser cleanup (`closeSearchBrowser`) always runs in a `finally` block, even on error.
- The Ghostery blocker's `disableBlockingInPage` is called in a `finally` block and swallows errors.

## Scripts

| Script       | Command                                              |
| ------------ | ---------------------------------------------------- |
| `dev`        | `bun run ./src/index.ts`                              |
| `build`      | `bun build ./src/index.ts --outdir ./dist --target bun` |
| `start`      | `bun run ./dist/index.js`                             |
| `check`      | `tsgo -p tsconfig.json --noEmit`                      |
| `test`       | `bun test`                                            |

## Known Limitations

- **macOS only.** The Chrome binary path is hardcoded to `/Applications/Google Chrome.app`.
- **Google DOM changes.** Result extraction relies on CSS selectors (`.N54PNb`, `.tF2Cxc`, `.MjjYud`, `.g`, `.ezO2md`, `a h3`) that may change without notice.
- **Rate limiting.** Google may serve `/sorry/` pages for rapid or concurrent searches, especially from fresh profiles or flagged IPs. A signed-in profile mitigates this.
- **No CAPTCHA solving.** If Google requires a CAPTCHA, the search fails.
- **Incomplete ad removal.** Google's inline "Sponsored" results may not be fully blocked by the Ghostery filter lists.
- **IP-based localization.** Even with `gl=us` and `hl=en`, Google may mix in locally relevant results based on the client's IP address.

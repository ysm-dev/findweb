# findweb

Google search CLI powered by system Chrome, with programmatic ad blocking.

## Install

```bash
bun install -g findweb
```

Or run directly:

```bash
bunx findweb "yc"
```

## Usage

```bash
# Single search
findweb "Y Combinator"

# Batch search
findweb "yc" "apple" "tesla" --parallel 3

# JSON output
findweb --json "react useEffect"

# Custom region and language
findweb --gl kr --lang ko "startup"

# More results
findweb -n 10 "rust async"

# Prepare a signed-in Chrome profile (reduces rate limiting)
findweb login
```

## Options

| Option             | Default        | Description                          |
| ------------------ | -------------- | ------------------------------------ |
| `--gl <country>`   | `us`           | Google region hint                   |
| `-l, --lang`       | `en`           | Google UI language                   |
| `-n, --num`        | `3`            | Results per query                    |
| `--parallel`       | `4`            | Batch tab concurrency                |
| `--userDataDir`    | auto-detected  | Chrome profile directory             |
| `--headed`         | `false`        | Show the Chrome window               |
| `--json`           | `false`        | Print output as JSON                 |

## How It Works

1. Launches system Chrome (`/Applications/Google Chrome.app`) with a free debugging port
2. Connects via CDP using puppeteer-core
3. Loads the [Ghostery adblocker](https://github.com/ghostery/adblocker) engine programmatically on each page
4. Navigates to Google, submits the query through DOM manipulation, and extracts results from the rendered page
5. Returns results as plain text or JSON, then closes Chrome

No Chromium download. No browser extension. No user confirmation.

## Batch Mode

Pass multiple quoted queries as positional arguments. Each query opens a separate tab in the same browser instance and profile.

```bash
findweb "yc" "apple" "tesla"
```

Results are returned in input order. Concurrency is controlled by `--parallel` (default: 4).

## Login

Google rate-limits unauthenticated or fresh-profile searches. To reduce `/sorry/` pages, sign in once:

```bash
findweb login
```

This opens a visible Chrome window with the Google sign-in page. After signing in, close the browser. The session is saved to the profile directory and reused by future searches.

## Output

### Plain text (default)

```
1. Y Combinator
https://www.ycombinator.com/
Y Combinator created a new model for funding early stage startups.

2. Y Combinator - Wikipedia
https://en.wikipedia.org/wiki/Y_Combinator
```

### JSON (`--json`)

```json
[
  {
    "title": "Y Combinator",
    "url": "https://www.ycombinator.com/",
    "snippet": "Y Combinator created a new model for funding early stage startups."
  }
]
```

## Requirements

- macOS
- System Chrome (`/Applications/Google Chrome.app`)
- [Bun](https://bun.sh) >= 1.3.11

## Development

```bash
git clone https://github.com/ysm-dev/findweb.git
cd findweb
bun install
bun run check    # tsgo typecheck
bun run test     # unit tests
bun run dev      # run from source
bun run build    # bundle to dist/
```

## License

MIT

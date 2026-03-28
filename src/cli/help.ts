export function renderRootHelp(): string {
  return [
    "Usage:",
    "  websearch [options] <query> [query ...]",
    "  websearch login [options]",
    "",
    "Commands:",
    "  login        Open a headed Chrome window and sign in to Google",
    "",
    "Search Options:",
    "  --gl <country>         Google region hint (default: us)",
    "  -l, --lang <lang>      Google UI language (default: en)",
    "  -n, --num <count>      Results per query (default: 3)",
    "  --parallel <count>     Batch tab concurrency (default: 4)",
    "  --userDataDir <dir>    Chrome profile directory",
    "  --headed               Launch visible system Chrome",
    "  --json                 Print JSON output",
    "",
    "Examples:",
    "  bunx websearch \"yc\"",
    "  bunx websearch \"yc\" \"apple\" --parallel 2",
    "  bunx websearch login",
  ].join("\n");
}

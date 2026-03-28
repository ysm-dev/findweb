import process from "node:process";

import { defineCommand, type ArgsDef } from "citty";

import { ensureInteractiveLogin } from "../flows/login.js";
import { ensureProfileDir } from "../profile.js";
import { loadBlocker } from "../../search/blocker.js";
import { closeSearchBrowser, launchSearchBrowser } from "../../search/browser.js";
import { searchQueriesInTabs } from "../../search/search.js";
import { printJsonResults, printPlainResults, exitCodeForOutcomes } from "../format.js";
import { normalizeSearchOptions } from "../schema.js";

function printResults(json: boolean, outcomes: Awaited<ReturnType<typeof searchQueriesInTabs>>): void {
  if (json) {
    printJsonResults(outcomes);
    return;
  }

  printPlainResults(outcomes);
}

const searchArgs: ArgsDef = {
  query: {
    type: "positional",
    description: "Search query. Add more quoted positionals to run a batch.",
    required: false,
  },
  gl: {
    type: "string",
    description: "Google region hint",
    default: "us",
  },
  lang: {
    type: "string",
    description: "Google UI language",
    default: "en",
    alias: ["l"],
  },
  num: {
    type: "string",
    description: "Results per query",
    default: "3",
    alias: ["n"],
  },
  parallel: {
    type: "string",
    description: "Batch tab concurrency",
    default: "4",
  },
  userDataDir: {
    type: "string",
    description: "Chrome profile directory",
    valueHint: "dir",
  },
  headed: {
    type: "boolean",
    description: "Launch visible system Chrome",
  },
  json: {
    type: "boolean",
    description: "Print JSON output",
  },
};

function printCommandError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR: ${message}`);
}

async function runSearch(args: {
  _: string[];
  gl?: unknown;
  headed?: unknown;
  json?: unknown;
  lang?: unknown;
  num?: unknown;
  parallel?: unknown;
  userDataDir?: unknown;
}): Promise<void> {
  const options = normalizeSearchOptions({
    _: args._,
    gl: typeof args.gl === "string" ? args.gl : undefined,
    headed: typeof args.headed === "boolean" ? args.headed : undefined,
    json: typeof args.json === "boolean" ? args.json : undefined,
    lang: typeof args.lang === "string" ? args.lang : undefined,
    num: typeof args.num === "string" || typeof args.num === "number" ? args.num : undefined,
    parallel: typeof args.parallel === "string" || typeof args.parallel === "number" ? args.parallel : undefined,
    userDataDir: typeof args.userDataDir === "string" ? args.userDataDir : undefined,
  });

  await ensureProfileDir(options.userDataDir);
  const loginWasRequired = await ensureInteractiveLogin({
    gl: options.gl,
    lang: options.lang,
    userDataDir: options.userDataDir,
  });
  if (loginWasRequired) {
    console.log("Login completed. Continuing with search...\n");
  }

  const blocker = await loadBlocker();
  const activeBrowser = await launchSearchBrowser({
    headed: options.headed,
    lang: options.lang,
    userDataDir: options.userDataDir,
  });

  try {
    const outcomes = await searchQueriesInTabs(activeBrowser.browser, blocker, options.queries, {
      gl: options.gl,
      lang: options.lang,
      num: options.num,
      parallel: options.parallel,
    }, activeBrowser.initialPage);

    printResults(options.json, outcomes);
    process.exitCode = exitCodeForOutcomes(outcomes);
  } finally {
    await closeSearchBrowser(activeBrowser);
  }
}

export function createSearchCommand(commandName = "findweb") {
  return defineCommand({
    meta: {
      name: commandName,
      description: "Search Google. Repeat quoted positional queries for batch mode.",
    },
    args: searchArgs,
    async run({ args }) {
      try {
        await runSearch(args);
      } catch (error) {
        printCommandError(error);
        process.exitCode = 1;
      }
    },
  });
}

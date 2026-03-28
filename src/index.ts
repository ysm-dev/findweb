import process from "node:process";

import { runMain } from "citty";

import { createLoginCommand } from "./cli/commands/login.js";
import { createSearchCommand } from "./cli/commands/search.js";
import { resolveRootAction } from "./cli/dispatch.js";
import { renderRootHelp } from "./cli/help.js";

function showRootHelp(): void {
  console.log(renderRootHelp());
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const action = resolveRootAction(rawArgs);

  if (action.kind === "help") {
    showRootHelp();
    return;
  }

  if (action.kind === "login") {
    await runMain(createLoginCommand(), { rawArgs: action.rawArgs });
    return;
  }

  await runMain(createSearchCommand(), { rawArgs: action.rawArgs });
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

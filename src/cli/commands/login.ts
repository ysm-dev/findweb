import fs from "node:fs/promises";

import { defineCommand, type ArgsDef } from "citty";

import { closeSearchBrowser, launchSearchBrowser } from "../../search/browser.js";
import { runLoginSession } from "../../search/search.js";
import { normalizeLoginOptions } from "../schema.js";

async function ensureProfileDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function runLoginFlow(gl: string, lang: string, userDataDir: string): Promise<void> {
  await ensureProfileDir(userDataDir);
  const activeBrowser = await launchSearchBrowser({
    headed: true,
    lang,
    userDataDir,
  });

  console.log(`Login browser launched with profile: ${userDataDir}`);
  console.log("Sign in to Google if you want to reuse a logged-in search profile.");
  console.log("Close the browser window when you are done.");

  try {
    await runLoginSession({ browser: activeBrowser.browser, gl, lang });
  } finally {
    await closeSearchBrowser(activeBrowser);
  }
}

function createLoginArgs(): ArgsDef {
  return {
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
    userDataDir: {
      type: "string",
      description: "Chrome profile directory",
      valueHint: "dir",
    },
  };
}

async function runLogin(args: { gl?: unknown; lang?: unknown; userDataDir?: unknown }): Promise<void> {
  const options = normalizeLoginOptions({
    gl: typeof args.gl === "string" ? args.gl : undefined,
    lang: typeof args.lang === "string" ? args.lang : undefined,
    userDataDir: typeof args.userDataDir === "string" ? args.userDataDir : undefined,
  });

  await runLoginFlow(options.gl, options.lang, options.userDataDir);
}

export function createLoginCommand(commandName = "websearch login") {
  return defineCommand({
    meta: { name: commandName, description: "Open a reusable Google sign-in session." },
    args: createLoginArgs(),
    async run({ args }) {
      await runLogin({
        gl: args.gl,
        lang: args.lang,
        userDataDir: args.userDataDir,
      });
    },
  });
}

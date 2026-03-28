import { defineCommand, type ArgsDef } from "citty";

import { runInteractiveLoginFlow } from "../flows/login.js";
import { normalizeLoginOptions } from "../schema.js";

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

  await runInteractiveLoginFlow(options);
}

export function createLoginCommand(commandName = "findweb login") {
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

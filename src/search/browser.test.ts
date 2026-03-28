import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "bun:test";

import { defaultUserDataDir } from "./browser.js";

function withEnv(run: () => void, env: Record<string, string | undefined>): void {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }

  try {
    run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }

      process.env[key] = value;
    }
  }
}

describe("defaultUserDataDir", () => {
  test("prefers GOOGLE_SEARCH_USER_DATA_DIR", () => {
    withEnv(() => {
      expect(defaultUserDataDir()).toBe("/custom/findweb-profile");
    }, {
      GOOGLE_SEARCH_USER_DATA_DIR: "/custom/findweb-profile",
      XDG_DATA_HOME: "/xdg/data-home",
    });
  });

  test("uses XDG_DATA_HOME when it is absolute", () => {
    withEnv(() => {
      expect(defaultUserDataDir()).toBe("/xdg/data-home/findweb/chrome-profile");
    }, {
      GOOGLE_SEARCH_USER_DATA_DIR: undefined,
      XDG_DATA_HOME: "/xdg/data-home",
    });
  });

  test("falls back to ~/.local/share when XDG_DATA_HOME is missing", () => {
    withEnv(() => {
      expect(defaultUserDataDir()).toBe(path.join(os.homedir(), ".local", "share", "findweb", "chrome-profile"));
    }, {
      GOOGLE_SEARCH_USER_DATA_DIR: undefined,
      XDG_DATA_HOME: undefined,
    });
  });

  test("ignores relative XDG_DATA_HOME values", () => {
    withEnv(() => {
      expect(defaultUserDataDir()).toBe(path.join(os.homedir(), ".local", "share", "findweb", "chrome-profile"));
    }, {
      GOOGLE_SEARCH_USER_DATA_DIR: undefined,
      XDG_DATA_HOME: "relative/data-home",
    });
  });
});

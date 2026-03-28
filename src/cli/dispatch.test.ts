import { describe, expect, test } from "bun:test";

import { resolveRootAction } from "./dispatch.js";

describe("resolveRootAction", () => {
  test("routes empty args to help", () => {
    expect(resolveRootAction([])).toEqual({ kind: "help" });
  });

  test("routes login subcommand", () => {
    expect(resolveRootAction(["login", "--lang", "en"])).toEqual({
      kind: "login",
      rawArgs: ["--lang", "en"],
    });
  });

  test("routes setup alias to login", () => {
    expect(resolveRootAction(["setup"])).toEqual({ kind: "login", rawArgs: [] });
  });

  test("routes everything else to search", () => {
    expect(resolveRootAction(["yc", "apple"])).toEqual({
      kind: "search",
      rawArgs: ["yc", "apple"],
    });
  });
});

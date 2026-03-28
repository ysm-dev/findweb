import { describe, expect, test } from "bun:test";

import { normalizeLoginOptions, normalizeSearchOptions } from "./schema.js";

describe("normalizeSearchOptions", () => {
  test("uses positional queries for batch mode", () => {
    const result = normalizeSearchOptions({
      _: ["yc", "apple"],
      gl: "US",
      lang: "en",
      num: "2",
      parallel: "3",
      userDataDir: "/tmp/test-profile",
    });

    expect(result.queries).toEqual(["yc", "apple"]);
    expect(result.gl).toBe("us");
    expect(result.num).toBe(2);
    expect(result.parallel).toBe(3);
  });

  test("rejects missing queries", () => {
    expect(() => normalizeSearchOptions({ _: [] })).toThrow("At least one query is required");
  });
});

describe("normalizeLoginOptions", () => {
  test("applies defaults", () => {
    const result = normalizeLoginOptions({});
    expect(result.gl).toBe("us");
    expect(result.lang).toBe("en");
    expect(result.userDataDir.length).toBeGreaterThan(0);
  });
});

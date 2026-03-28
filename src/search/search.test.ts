import { describe, expect, test } from "bun:test";

import { hasCompletedLoginPage, isCompletedLoginUrl } from "./search.js";

describe("isCompletedLoginUrl", () => {
  test("treats accounts.google.com as incomplete", () => {
    expect(isCompletedLoginUrl("https://accounts.google.com/ServiceLogin?hl=en")).toBe(false);
  });

  test("treats google destinations as complete", () => {
    expect(isCompletedLoginUrl("https://www.google.com/?hl=en&gl=us&pws=0")).toBe(true);
    expect(isCompletedLoginUrl("https://myaccount.google.com/")).toBe(true);
  });

  test("rejects non-google or invalid urls", () => {
    expect(isCompletedLoginUrl("about:blank")).toBe(false);
    expect(isCompletedLoginUrl("https://example.com/")).toBe(false);
  });
});

describe("hasCompletedLoginPage", () => {
  test("detects a completed login among open pages", () => {
    expect(
      hasCompletedLoginPage([
        "about:blank",
        "https://accounts.google.com/ServiceLogin?hl=en",
        "https://www.google.com/?hl=en&gl=us&pws=0",
      ]),
    ).toBe(true);
  });

  test("stays false until a non-accounts google page appears", () => {
    expect(
      hasCompletedLoginPage([
        "about:blank",
        "https://accounts.google.com/v3/signin/challenge/pwd",
      ]),
    ).toBe(false);
  });
});

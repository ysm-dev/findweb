import type { Browser, Page } from "puppeteer-core";

import {
  extractResults,
  gotoGoogleHome,
  preparePage,
  submitSearch,
  waitForIdle,
} from "./page.js";
import type {
  LoginSessionOptions,
  SearchBatchOptions,
  SearchOutcome,
  SearchQueryOptions,
  SearchResult,
} from "./types.js";

const LOGIN_POLL_MS = 250;

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isCompletedLoginUrl(url: string): boolean {
  const hostname = hostnameFromUrl(url);
  return hostname !== null && hostname !== "accounts.google.com" && (hostname === "google.com" || hostname.endsWith(".google.com"));
}

export function hasCompletedLoginPage(urls: string[]): boolean {
  return urls.some((url) => isCompletedLoginUrl(url));
}

async function pageUrls(browser: Browser): Promise<string[]> {
  const pages = await browser.pages();
  return pages.map((page) => page.url());
}

async function waitForCompletedLogin(loginPage: Page, browser: Browser): Promise<void> {
  let lastSeenUrls = [loginPage.url()];

  while (true) {
    if (browser.connected) {
      lastSeenUrls = await pageUrls(browser).catch(() => lastSeenUrls);
      if (hasCompletedLoginPage(lastSeenUrls)) {
        return;
      }
    }

    if (!browser.connected || loginPage.isClosed()) {
      if (hasCompletedLoginPage(lastSeenUrls)) {
        return;
      }

      throw new Error("Google login was not completed.");
    }

    await wait(LOGIN_POLL_MS);
  }
}

function isSorryPage(url: string): boolean {
  return url.includes("/sorry/");
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isInterruptedLoginError(error: unknown, loginPage: Page | null, browser: Browser): boolean {
  if (!browser.connected || loginPage?.isClosed()) {
    return true;
  }

  const message = toErrorMessage(error);
  return message.includes("Navigating frame was detached") || message.includes("LifecycleWatcher disposed") || message.includes("Target closed") || message.includes("Session closed");
}

export async function searchQuery(options: SearchQueryOptions): Promise<SearchResult[]> {
  const page = await options.browser.newPage();
  try {
    await preparePage(page, options.lang);
    await options.blocker.enableBlockingInPage(page);
    await gotoGoogleHome(page, options.lang, options.gl);
    await waitForIdle(page);
    await submitSearch(page, options.query, options.lang, options.gl);

    if (isSorryPage(page.url())) {
      throw new Error("Google returned a /sorry/ page for this profile/IP. Re-run later or use a logged-in profile.");
    }

    return extractResults(page, options.num);
  } finally {
    await options.blocker.disableBlockingInPage(page).catch(() => undefined);
    await page.close().catch(() => undefined);
  }
}

async function runBatchWorker(browser: Browser, options: SearchBatchOptions & { queries: string[]; blocker: SearchQueryOptions["blocker"]; results: SearchOutcome[]; cursor: { value: number } }): Promise<void> {
  while (true) {
    const index = options.cursor.value;
    options.cursor.value += 1;

    if (index >= options.queries.length) {
      return;
    }

    const query = options.queries[index] ?? "";
    try {
      const results = await searchQuery({
        blocker: options.blocker,
        browser,
        gl: options.gl,
        lang: options.lang,
        num: options.num,
        query,
      });
      options.results[index] = { error: null, query, results };
    } catch (error) {
      options.results[index] = { error: toErrorMessage(error), query, results: [] };
    }
  }
}

export async function searchQueriesInTabs(browser: Browser, blocker: SearchQueryOptions["blocker"], queries: string[], options: SearchBatchOptions): Promise<SearchOutcome[]> {
  const concurrency = Math.max(1, Math.min(options.parallel, queries.length));
  const results = new Array<SearchOutcome>(queries.length);
  const cursor = { value: 0 };

  await Promise.all(
    Array.from({ length: concurrency }, () =>
      runBatchWorker(browser, {
        blocker,
        cursor,
        gl: options.gl,
        lang: options.lang,
        num: options.num,
        parallel: options.parallel,
        queries,
        results,
      }),
    ),
  );

  return results;
}

export async function runLoginSession(options: LoginSessionOptions): Promise<void> {
  let loginPage: Page | null = null;
  const handleSigint = (): void => {
    void options.browser.close().catch(() => undefined);
  };

  process.once("SIGINT", handleSigint);
  try {
    loginPage = await options.browser.newPage();
    await preparePage(loginPage, options.lang);
    await loginPage.goto(
      `https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent(`https://www.google.com/?hl=${options.lang}&gl=${options.gl}&pws=0`)}&hl=${encodeURIComponent(options.lang)}`,
      { waitUntil: "networkidle2" },
    );
    await waitForCompletedLogin(loginPage, options.browser);
  } catch (error) {
    if (isInterruptedLoginError(error, loginPage, options.browser)) {
      throw new Error("Google login was not completed.");
    }

    throw error;
  } finally {
    process.off("SIGINT", handleSigint);
    await loginPage?.close().catch(() => undefined);
  }
}

import type { Browser } from "puppeteer-core";

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

function isSorryPage(url: string): boolean {
  return url.includes("/sorry/");
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  const loginPage = await options.browser.newPage();
  await preparePage(loginPage, options.lang);
  await loginPage.goto(
    `https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent(`https://www.google.com/?hl=${options.lang}&gl=${options.gl}&pws=0`)}&hl=${encodeURIComponent(options.lang)}`,
    { waitUntil: "networkidle2" },
  );

  await new Promise<void>((resolve) => {
    const done = (): void => resolve();
    options.browser.once("disconnected", done);
    process.once("SIGINT", async () => {
      await options.browser.close().catch(() => undefined);
      done();
    });
  });
}

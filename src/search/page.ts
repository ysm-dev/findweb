import type { Page } from "puppeteer-core";

import type { SearchResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PWS = "0";

const SEARCH_READY_SCRIPT = `(() => {
  if (window.location.pathname.includes('/sorry/')) {
    return true;
  }

  if (document.querySelector('a h3')) {
    return true;
  }

  return window.location.pathname === '/search' && document.readyState !== 'loading' && Boolean(document.querySelector('textarea[name="q"], input[name="q"]'));
})()`;

function userAgent(): string {
  return [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "AppleWebKit/537.36 (KHTML, like Gecko)",
    "Chrome/146.0.0.0 Safari/537.36",
  ].join(" ");
}

function acceptLanguage(lang: string): string {
  if (lang === "en") {
    return "en-US,en;q=0.9";
  }

  if (lang.includes("-")) {
    const base = lang.split("-")[0] ?? lang;
    return `${lang},${base};q=0.9,en;q=0.8`;
  }

  return `${lang};q=1.0,en;q=0.8`;
}

function createGoogleSearchUrl(query: string, lang: string, gl: string): string {
  return [
    "https://www.google.com/search",
    `?hl=${encodeURIComponent(lang)}`,
    `&gl=${encodeURIComponent(gl)}`,
    `&pws=${encodeURIComponent(DEFAULT_PWS)}`,
    `&q=${encodeURIComponent(query)}`,
  ].join("");
}

function createExtractResultsScript(limit: number): string {
  return `(() => {
    const max = ${JSON.stringify(limit)};
    const strip = (value) => value.split(/\\n+/).map((part) => part.trim()).filter(Boolean);
    const results = [];
    const seen = new Set();

    for (const heading of Array.from(document.querySelectorAll('a h3'))) {
      const anchor = heading.closest('a');
      const url = anchor && anchor.href ? anchor.href.trim() : '';
      const title = heading.innerText.trim();
      if (!url || !title) continue;
      if (!/^https?:/.test(url)) continue;
      if (/^https?:\\/\\/(?:www\\.)?google\./.test(url)) continue;
      if (seen.has(url)) continue;

      const card = heading.closest('.N54PNb, .tF2Cxc, .MjjYud, .g, .ezO2md') || (anchor ? anchor.closest('div') : null);
      const lines = strip(card && card.innerText ? card.innerText : '');
      const candidates = [];
      for (const line of lines) {
        if (!line || line === title || line === url) continue;
        if (/^https?:\\/\\//.test(line)) continue;
        if (line.includes('google.com')) continue;
        if (line === 'About this result') continue;
        candidates.push(line);
      }

      results.push({
        title,
        url,
        snippet: candidates.find((line) => line.length >= 20) || candidates[0] || '',
      });
      seen.add(url);
      if (results.length >= max) break;
    }

    return results;
  })()`;
}

export async function preparePage(page: Page, lang: string): Promise<void> {
  page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS);
  page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  await page.setViewport({ width: 1440, height: 1400, deviceScaleFactor: 1 });
  await page.setUserAgent(userAgent());
  await page.setExtraHTTPHeaders({
    "accept-language": acceptLanguage(lang),
  });
}

export async function gotoGoogleSearchResults(page: Page, query: string, lang: string, gl: string): Promise<void> {
  const searchUrl = createGoogleSearchUrl(query, lang, gl);
  if (page.url() !== searchUrl) {
    await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
  }

  await page.waitForFunction(SEARCH_READY_SCRIPT, { timeout: DEFAULT_TIMEOUT_MS });
}

export async function extractResults(page: Page, limit: number): Promise<SearchResult[]> {
  return page.evaluate(createExtractResultsScript(limit)) as Promise<SearchResult[]>;
}

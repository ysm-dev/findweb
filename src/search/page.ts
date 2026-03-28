import type { Page } from "puppeteer-core";

import type { SearchResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PWS = "0";

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

function createGoogleHomeUrl(lang: string, gl: string): string {
  return `https://www.google.com/?hl=${encodeURIComponent(lang)}&gl=${encodeURIComponent(gl)}&pws=${DEFAULT_PWS}`;
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

function createSubmitSearchScript(query: string, lang: string, gl: string): string {
  return `(() => {
    const value = ${JSON.stringify(query)};
    const lang = ${JSON.stringify(lang)};
    const gl = ${JSON.stringify(gl)};
    const pws = ${JSON.stringify(DEFAULT_PWS)};
    const el = document.querySelector('textarea[name="q"], input[name="q"]');
    if (!el) {
      throw new Error("Google search input not found");
    }

    const setHidden = (form, name, hiddenValue) => {
      let input = form.querySelector('input[name="' + name + '"]');
      if (!input) {
        input = document.createElement("input");
        input.setAttribute("type", "hidden");
        input.setAttribute("name", name);
        form.appendChild(input);
      }
      input.setAttribute("value", hiddenValue);
    };

    el.focus();
    const proto = Object.getPrototypeOf(el);
    const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, "value") : undefined;
    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));

    const form = el.form || document.querySelector('form[action="/search"]');
    if (form && typeof form.requestSubmit === "function") {
      setHidden(form, "hl", lang);
      setHidden(form, "gl", gl);
      setHidden(form, "pws", pws);
      form.requestSubmit();
      return;
    }

    if (form) {
      const action = new URL(form.getAttribute("action") || "/search", window.location.origin);
      action.searchParams.set("hl", lang);
      action.searchParams.set("gl", gl);
      action.searchParams.set("pws", pws);
      form.setAttribute("action", action.toString());
      form.submit();
      return;
    }

    window.location.href = ${JSON.stringify(createGoogleSearchUrl(query, lang, gl))};
  })()`;
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

export async function gotoGoogleHome(page: Page, lang: string, gl: string): Promise<void> {
  await page.goto(createGoogleHomeUrl(lang, gl), { waitUntil: "networkidle2" });
  await page.waitForSelector('textarea[name="q"], input[name="q"]');
}

export async function submitSearch(page: Page, query: string, lang: string, gl: string): Promise<void> {
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }),
    page.evaluate(createSubmitSearchScript(query, lang, gl)),
  ]);
}

export async function extractResults(page: Page, limit: number): Promise<SearchResult[]> {
  return page.evaluate(createExtractResultsScript(limit)) as Promise<SearchResult[]>;
}

export async function waitForIdle(page: Page): Promise<void> {
  await page.waitForNetworkIdle({ idleTime: 700, timeout: DEFAULT_TIMEOUT_MS }).catch(() => undefined);
}

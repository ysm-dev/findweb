import type { ChildProcess } from "node:child_process";

import type { PuppeteerBlocker } from "@ghostery/adblocker-puppeteer";
import type { Browser } from "puppeteer-core";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type SearchFailure = {
  query: string;
  error: string;
  results: [];
};

export type SearchSuccess = {
  query: string;
  error: null;
  results: SearchResult[];
};

export type SearchOutcome = SearchFailure | SearchSuccess;

export type LaunchSearchBrowserOptions = {
  headed: boolean;
  lang: string;
  userDataDir: string;
};

export type ActiveBrowser = {
  browser: Browser;
  chromeProcess: ChildProcess;
  port: number;
};

export type SearchQueryOptions = {
  blocker: PuppeteerBlocker;
  browser: Browser;
  gl: string;
  lang: string;
  num: number;
  query: string;
};

export type SearchBatchOptions = {
  gl: string;
  lang: string;
  num: number;
  parallel: number;
};

export type LoginSessionOptions = {
  browser: Browser;
  gl: string;
  lang: string;
};

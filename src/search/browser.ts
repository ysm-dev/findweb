import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import puppeteer from "puppeteer-core";
import type { Browser, Page } from "puppeteer-core";

import type { ActiveBrowser, LaunchSearchBrowserOptions } from "./types.js";

export const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const DEFAULT_TIMEOUT_MS = 30_000;
const CDP_POLL_MS = 100;
const REUSABLE_PAGE_URL = "about:blank";

type PersistentBrowserState = {
  pid: number;
  port: number;
};

function createDebugServer(): http.Server {
  return http.createServer();
}

function persistentStatePath(userDataDir: string): string {
  return path.join(userDataDir, ".findweb-browser.json");
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPersistentState(userDataDir: string): Promise<PersistentBrowserState | null> {
  try {
    const file = await fs.readFile(persistentStatePath(userDataDir), "utf8");
    const parsed = JSON.parse(file) as Partial<PersistentBrowserState>;
    if (typeof parsed.pid !== "number" || typeof parsed.port !== "number") {
      return null;
    }

    return { pid: parsed.pid, port: parsed.port };
  } catch {
    return null;
  }
}

async function writePersistentState(userDataDir: string, state: PersistentBrowserState): Promise<void> {
  await fs.mkdir(userDataDir, { recursive: true });
  await fs.writeFile(persistentStatePath(userDataDir), `${JSON.stringify(state)}\n`, "utf8");
}

async function clearPersistentState(userDataDir: string): Promise<void> {
  await fs.rm(persistentStatePath(userDataDir), { force: true });
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createDebugServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to allocate a free debugging port"));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function isCdpReady(port: number): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      const request = http.get(`http://127.0.0.1:${port}/json/version`, (response) => {
        response.resume();
        if (response.statusCode === 200) {
          resolve();
          return;
        }

        reject(new Error(`Unexpected CDP status ${response.statusCode}`));
      });

      request.on("error", reject);
    });

    return true;
  } catch {
    return false;
  }
}

async function waitForCdp(port: number, activeBrowser: ActiveBrowser["chromeProcess"]): Promise<void> {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (activeBrowser?.exitCode !== null) {
      throw new Error(`Chrome exited before opening debugging port ${port}`);
    }

    if (await isCdpReady(port)) {
      return;
    }

    await wait(CDP_POLL_MS);
  }

  throw new Error(`Chrome debugging port ${port} did not become ready in time`);
}

function reusablePageScore(url: string): number {
  if (url.startsWith("https://www.google.com/search?")) {
    return 3;
  }

  if (url === REUSABLE_PAGE_URL) {
    return 2;
  }

  if (url.startsWith("https://www.google.com/")) {
    return 1;
  }

  return 0;
}

async function reusablePage(browser: Browser): Promise<Page | null> {
  const pages = await browser.pages();
  const existing = pages
    .filter((page) => !page.isClosed())
    .sort((a, b) => reusablePageScore(b.url()) - reusablePageScore(a.url()))[0] ?? null;
  if (existing) {
    return existing;
  }

  const page = await browser.newPage().catch(() => null);
  if (!page) {
    return null;
  }

  await page.goto(REUSABLE_PAGE_URL, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  return page;
}

async function connectToBrowser(port: number): Promise<Browser> {
  return puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
}

async function connectPersistentBrowser(options: LaunchSearchBrowserOptions): Promise<ActiveBrowser | null> {
  const state = await readPersistentState(options.userDataDir);
  if (!state || !isProcessRunning(state.pid) || !(await isCdpReady(state.port))) {
    await clearPersistentState(options.userDataDir);
    return null;
  }

  try {
    const browser = await connectToBrowser(state.port);
    return {
      browser,
      chromeProcess: null,
      initialPage: await reusablePage(browser),
      persistent: true,
      port: state.port,
    };
  } catch {
    await clearPersistentState(options.userDataDir);
    return null;
  }
}

function createChromeArgs(options: LaunchSearchBrowserOptions, port: number): string[] {
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${options.userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1440,1400",
    `--lang=${options.lang}`,
    "about:blank",
  ];

  if (!options.headed) {
    args.splice(args.length - 1, 0, "--headless=new", "--disable-gpu");
  }

  return args;
}

export async function launchSearchBrowser(options: LaunchSearchBrowserOptions): Promise<ActiveBrowser> {
  if (!options.headed) {
    const activeBrowser = await connectPersistentBrowser(options);
    if (activeBrowser) {
      return activeBrowser;
    }
  }

  const port = await findFreePort();
  const chromeProcess = spawn(CHROME_BIN, createChromeArgs(options, port), {
    detached: !options.headed,
    stdio: options.headed ? ["ignore", "ignore", "pipe"] : "ignore",
  });

  if (!options.headed) {
    chromeProcess.unref();
  }

  await waitForCdp(port, chromeProcess);
  const browser = await connectToBrowser(port);
  const initialPage = await reusablePage(browser);

  if (!options.headed && typeof chromeProcess.pid === "number") {
    await writePersistentState(options.userDataDir, { pid: chromeProcess.pid, port });
  }

  return {
    browser,
    chromeProcess,
    initialPage,
    persistent: !options.headed,
    port,
  };
}

export async function closeSearchBrowser(activeBrowser: ActiveBrowser): Promise<void> {
  if (activeBrowser.persistent) {
    activeBrowser.browser.disconnect();
    return;
  }

  await activeBrowser.browser.close().catch(() => undefined);
  if (activeBrowser.chromeProcess?.exitCode === null) {
    activeBrowser.chromeProcess.kill("SIGTERM");
  }
}

function defaultXdgDataHome(): string {
  const configured = process.env.XDG_DATA_HOME;
  if (configured && path.isAbsolute(configured)) {
    return configured;
  }

  return path.join(os.homedir(), ".local", "share");
}

export function defaultUserDataDir(): string {
  const configured = process.env.GOOGLE_SEARCH_USER_DATA_DIR;
  if (configured) {
    return configured;
  }

  return path.join(defaultXdgDataHome(), "findweb", "chrome-profile");
}

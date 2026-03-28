import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import http from "node:http";

import puppeteer from "puppeteer-core";

import type { ActiveBrowser, LaunchSearchBrowserOptions } from "./types.js";

export const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const DEFAULT_TIMEOUT_MS = 30_000;

function createDebugServer(): http.Server {
  return http.createServer();
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
    if (activeBrowser.exitCode !== null) {
      throw new Error(`Chrome exited before opening debugging port ${port}`);
    }

    if (await isCdpReady(port)) {
      return;
    }

    await wait(250);
  }

  throw new Error(`Chrome debugging port ${port} did not become ready in time`);
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
  const port = await findFreePort();
  const chromeProcess = spawn(CHROME_BIN, createChromeArgs(options, port), {
    stdio: ["ignore", "ignore", "pipe"],
  });

  await waitForCdp(port, chromeProcess);
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
  return { browser, chromeProcess, port };
}

export async function closeSearchBrowser(activeBrowser: ActiveBrowser): Promise<void> {
  await activeBrowser.browser.close().catch(() => undefined);
  if (activeBrowser.chromeProcess.exitCode === null) {
    activeBrowser.chromeProcess.kill("SIGTERM");
  }
}

export function defaultUserDataDir(): string {
  const configured = process.env.GOOGLE_SEARCH_USER_DATA_DIR;
  if (configured) {
    return configured;
  }

  const legacyProfile = "/tmp/gsearch-manual-login-profile";
  return ["/tmp/google-search-profile", legacyProfile].find((candidate) => existsSync(candidate)) ?? "/tmp/google-search-profile";
}

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PuppeteerBlocker } from "@ghostery/adblocker-puppeteer";

let blockerPromise: Promise<PuppeteerBlocker> | undefined;

function defaultCacheDir(): string {
  return process.env.GOOGLE_SEARCH_CACHE_DIR ?? path.join(os.homedir(), ".cache", "google-search");
}

async function readCache(filePath: string): Promise<Uint8Array> {
  return fs.readFile(filePath);
}

async function writeCache(filePath: string, buffer: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

export async function loadBlocker(): Promise<PuppeteerBlocker> {
  if (!blockerPromise) {
    blockerPromise = (async () => {
      const cacheDir = defaultCacheDir();
      await fs.mkdir(cacheDir, { recursive: true });

      return PuppeteerBlocker.fromPrebuiltAdsAndTracking(globalThis.fetch.bind(globalThis), {
        path: path.join(cacheDir, "ghostery-engine.bin"),
        read: readCache,
        write: writeCache,
      });
    })();
  }

  return blockerPromise;
}

import fs from "node:fs/promises";
import path from "node:path";

const PROFILE_READY_MARKER = ".findweb-profile-ready";

export async function ensureProfileDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function readyMarkerPath(userDataDir: string): string {
  return path.join(userDataDir, PROFILE_READY_MARKER);
}

export async function hasPreparedProfile(userDataDir: string): Promise<boolean> {
  try {
    await fs.access(readyMarkerPath(userDataDir));
    return true;
  } catch {
    return false;
  }
}

export async function markProfilePrepared(userDataDir: string): Promise<void> {
  await ensureProfileDir(userDataDir);
  await fs.writeFile(readyMarkerPath(userDataDir), `${new Date().toISOString()}\n`, "utf8");
}

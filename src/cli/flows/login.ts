import { closeSearchBrowser, launchSearchBrowser } from "../../search/browser.js";
import { runLoginSession } from "../../search/search.js";
import { ensureProfileDir, hasPreparedProfile, markProfilePrepared } from "../profile.js";

type LoginFlowOptions = {
  gl: string;
  lang: string;
  userDataDir: string;
};

function printLoginInstructions(userDataDir: string): void {
  console.log(`Login browser launched with profile: ${userDataDir}`);
  console.log("Sign in to Google to prepare this profile for future searches.");
  console.log("Close the browser window when you are done.");
}

export async function runInteractiveLoginFlow(options: LoginFlowOptions): Promise<void> {
  await ensureProfileDir(options.userDataDir);
  const activeBrowser = await launchSearchBrowser({
    headed: true,
    lang: options.lang,
    userDataDir: options.userDataDir,
  });

  printLoginInstructions(options.userDataDir);

  try {
    await runLoginSession({
      browser: activeBrowser.browser,
      gl: options.gl,
      lang: options.lang,
    });
  } finally {
    await closeSearchBrowser(activeBrowser);
  }

  await markProfilePrepared(options.userDataDir);
}

export async function ensureInteractiveLogin(options: LoginFlowOptions): Promise<boolean> {
  await ensureProfileDir(options.userDataDir);

  if (await hasPreparedProfile(options.userDataDir)) {
    return false;
  }

  console.log("No prepared Google profile was found for this user-data-dir.");
  console.log("A login step is required before the first search.");
  await runInteractiveLoginFlow(options);
  return true;
}

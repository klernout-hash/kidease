/**
 * Vercel Ignored Build Step for kidease-git.
 * Exit 0 skips the deployment. Exit 1 builds it.
 *
 * The project skips every cursor/* preview. This branch needs a public
 * preview of the parent sign-up form. Other cursor branches stay skipped.
 * main and every other ref still build.
 */
import { pathToFileURL } from "node:url";

const PREVIEW_BRANCH = "cursor/parent-sms-signup-ba39";

export function shouldIgnoreVercelBuild(ref) {
  const name = String(ref || "");
  if (name === PREVIEW_BRANCH) return false;
  return name.startsWith("cursor/");
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  const skip = shouldIgnoreVercelBuild(process.env.VERCEL_GIT_COMMIT_REF);
  process.exit(skip ? 0 : 1);
}

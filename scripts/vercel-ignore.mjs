/**
 * Vercel Ignored Build Step for kidease-git.
 * Exit 0 skips the deployment. Exit 1 builds it.
 *
 * The project skips every cursor/* preview. Two branches need a public
 * preview: the parent sign-up form, and the PostHog Allow opt-in fix.
 * Other cursor branches stay skipped. main and every other ref still build.
 */
import { pathToFileURL } from "node:url";

const PREVIEW_BRANCHES = new Set([
  "cursor/parent-sms-signup-ba39",
  "cursor/posthog-opt-in-allow-e792",
]);

export function shouldIgnoreVercelBuild(ref) {
  const name = String(ref || "");
  if (PREVIEW_BRANCHES.has(name)) return false;
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

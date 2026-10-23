/**
 * Vercel Ignored Build Step for kidease-git.
 * Exit 0 skips the deployment. Exit 1 builds it.
 *
 * The project skips every cursor/* preview. Two branches need a public
 * preview: the parent sign-up form, and the PostHog Allow opt-in fix.
 * Other cursor branches stay skipped. main and every other ref still build.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PREVIEW_BRANCHES = new Set([
  "cursor/parent-sms-signup-ba39",
  "cursor/posthog-opt-in-allow-e792",
]);

/** Paths that do not change the website Vercel ships. */
export function isWebsiteChange(path) {
  const name = String(path || "").replaceAll("\\", "/");
  if (!name) return false;
  if (name.startsWith("docs/") || name.startsWith(".github/") || name.startsWith("android/") || name.startsWith("ios/")) return false;
  if (name.startsWith("e2e/") || name.startsWith("kidease-store-readiness/")) return false;
  if (name.endsWith(".md") && !name.startsWith("src/")) return false;
  return true;
}

/**
 * @param {string} ref
 * @param {{ changedFiles?: string[], vercelEnv?: string, commitSha?: string, previousSha?: string }} [opts]
 */
export function shouldIgnoreVercelBuild(ref, opts = {}) {
  const name = String(ref || "");
  if (PREVIEW_BRANCHES.has(name)) return false;
  if (name.startsWith("cursor/")) return true;
  const files = opts.changedFiles;
  if (Array.isArray(files) && files.length > 0 && files.every((file) => !isWebsiteChange(file))) return true;
  // A preview redeploy of the same commit is a second build of a tree we already shipped.
  if (
    opts.vercelEnv === "preview" &&
    opts.commitSha &&
    opts.previousSha &&
    opts.commitSha === opts.previousSha
  ) {
    return true;
  }
  return false;
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

function changedFilesFromGit() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || "";
  const prev = process.env.VERCEL_GIT_PREVIOUS_SHA || "";
  if (!sha || !prev || sha === prev) return [];
  try {
    const out = execFileSync("git", ["diff", "--name-only", prev, sha], { encoding: "utf8" });
    return out.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

if (isDirectRun()) {
  const skip = shouldIgnoreVercelBuild(process.env.VERCEL_GIT_COMMIT_REF, {
    changedFiles: changedFilesFromGit(),
    vercelEnv: process.env.VERCEL_ENV,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
    previousSha: process.env.VERCEL_GIT_PREVIOUS_SHA,
  });
  process.exit(skip ? 0 : 1);
}

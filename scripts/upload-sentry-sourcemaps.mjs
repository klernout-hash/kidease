#!/usr/bin/env node
/**
 * Uploads build sourcemaps to Sentry only when SENTRY_UPLOAD_SOURCEMAPS=1.
 * The switch stays off. A normal build does not call Sentry and does not
 * print the auth token. Native dSYM and ProGuard uploads are not this script.
 */
import { spawnSync } from "node:child_process";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const roots = [".vercel/output/static/assets", "dist/client/assets", ".output/public/assets"];

export function sentrySourcemapUploadEnabled(env = process.env) {
  return String(env.SENTRY_UPLOAD_SOURCEMAPS || "").trim() === "1";
}

function projectFromEnv(env) {
  const org = String(env.SENTRY_ORG || "").trim();
  const project = String(env.SENTRY_PROJECT || "").trim();
  if (!org || !project) return null;
  return { org, project };
}

async function mapFiles(dir) {
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const found = [];
  for (const name of names) {
    if (!name.endsWith(".map")) continue;
    const path = join(dir, name);
    const info = await stat(path).catch(() => null);
    if (info?.isFile()) found.push(path);
  }
  return found;
}

async function main() {
  if (!sentrySourcemapUploadEnabled(process.env)) {
    console.log("[sentry-sourcemaps] skipped. SENTRY_UPLOAD_SOURCEMAPS stays unset.");
    return;
  }
  const token = String(process.env.SENTRY_AUTH_TOKEN || "").trim();
  const project = projectFromEnv(process.env);
  if (!token || !project) {
    console.error("[sentry-sourcemaps] SENTRY_UPLOAD_SOURCEMAPS=1 needs SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT.");
    process.exit(1);
  }
  const release = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "").trim();
  let uploaded = false;
  for (const dir of roots) {
    const maps = await mapFiles(dir);
    if (!maps.length) continue;
    const args = [
      "--yes",
      "@sentry/cli@2.58.4",
      "sourcemaps",
      "upload",
      "--org",
      project.org,
      "--project",
      project.project,
    ];
    if (release) args.push("--release", release);
    args.push(dir);
    const upload = spawnSync("npx", args, {
      stdio: "inherit",
      env: { ...process.env, SENTRY_AUTH_TOKEN: token },
    });
    if (upload.status !== 0) {
      console.error("[sentry-sourcemaps] upload failed");
      process.exit(upload.status || 1);
    }
    const posthogWillDelete = Boolean(process.env.POSTHOG_CLI_API_KEY || process.env.POSTHOG_PERSONAL_API_KEY);
    if (!posthogWillDelete) {
      await Promise.all(maps.map((path) => rm(path, { force: true })));
    }
    uploaded = true;
  }
  console.log(uploaded ? "[sentry-sourcemaps] uploaded. Maps stay off the public site." : "[sentry-sourcemaps] no map files to upload.");
}

const isDirectRun = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);
if (isDirectRun) {
  await main();
}

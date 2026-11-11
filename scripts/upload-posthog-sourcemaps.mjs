#!/usr/bin/env node
/**
 * Uploads build sourcemaps to PostHog when a personal API key is set, then
 * deletes the map files so they are not published on the website.
 * Without the key this does nothing.
 */
import { spawnSync } from "node:child_process";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const key = process.env.POSTHOG_CLI_API_KEY || process.env.POSTHOG_PERSONAL_API_KEY || "";
const roots = [".vercel/output/static/assets", "dist/client/assets", ".output/public/assets"];

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

if (!key) {
  console.log("[posthog-sourcemaps] skipped. Set POSTHOG_CLI_API_KEY to upload maps at build.");
  process.exit(0);
}

const project = process.env.POSTHOG_CLI_PROJECT_ID || process.env.POSTHOG_PROJECT_ID || "594559";
const host = process.env.POSTHOG_CLI_HOST || "https://us.posthog.com";
const env = {
  ...process.env,
  POSTHOG_CLI_API_KEY: key,
  POSTHOG_CLI_PROJECT_ID: project,
  POSTHOG_CLI_HOST: host,
};
let uploaded = false;
for (const dir of roots) {
  const maps = await mapFiles(dir);
  if (!maps.length) continue;
  const upload = spawnSync(
    "npx",
    ["--yes", "@posthog/cli@0.6.5", "sourcemap", "upload", "--directory", dir],
    { stdio: "inherit", env },
  );
  if (upload.status !== 0) {
    console.error("[posthog-sourcemaps] upload failed");
    process.exit(upload.status || 1);
  }
  await Promise.all(maps.map((path) => rm(path, { force: true })));
  uploaded = true;
}
console.log(uploaded ? "[posthog-sourcemaps] uploaded. Maps stay off the public site." : "[posthog-sourcemaps] no map files to upload.");

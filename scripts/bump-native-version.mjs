#!/usr/bin/env node
/**
 * Set the store version and build number in the iOS and Android projects.
 *
 *   node scripts/bump-native-version.mjs --version 1.0.1 --build 2
 *
 * Does not upload a build. Does not print signing secrets.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function parseBumpArgs(argv) {
  let version = "";
  let build = "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--version" && next) {
      version = next;
      i += 1;
    } else if (arg.startsWith("--version=")) version = arg.slice("--version=".length);
    else if (arg === "--build" && next) {
      build = next;
      i += 1;
    } else if (arg.startsWith("--build=")) build = arg.slice("--build=".length);
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("--version must look like 1.2.3");
  if (!/^[1-9]\d*$/.test(build)) throw new Error("--build must be a positive integer");
  return { version, build };
}

export function bumpGradle(source, version, build) {
  const next = source
    .replace(/versionCode \d+/, `versionCode ${build}`)
    .replace(/versionName "[^"]+"/, `versionName "${version}"`);
  if (!next.includes(`versionCode ${build}`) || !next.includes(`versionName "${version}"`)) {
    throw new Error("android/app/build.gradle is missing versionCode or versionName");
  }
  return next;
}

export function bumpPbxproj(source, version, build) {
  const next = source
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
  if (!next.includes(`MARKETING_VERSION = ${version};`) || !next.includes(`CURRENT_PROJECT_VERSION = ${build};`)) {
    throw new Error("iOS project is missing MARKETING_VERSION or CURRENT_PROJECT_VERSION");
  }
  return next;
}

function main() {
  const { version, build } = parseBumpArgs(process.argv.slice(2));
  const gradlePath = join(root, "android/app/build.gradle");
  const pbxPath = join(root, "ios/App/App.xcodeproj/project.pbxproj");
  writeFileSync(gradlePath, bumpGradle(readFileSync(gradlePath, "utf8"), version, build));
  writeFileSync(pbxPath, bumpPbxproj(readFileSync(pbxPath, "utf8"), version, build));
  process.stdout.write(`Native version ${version} (${build})\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

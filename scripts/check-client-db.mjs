/**
 * Fail the production build if database, schema, or migration code is in the
 * browser bundle. Preview still applies migrations/*.sql on the server.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const clientRoots = [join(root, ".output", "public"), join(root, ".vercel", "output", "static")];

const TEXT_MARKERS = [
  /create table/i,
  /create unique index/i,
  /create index if not exists/i,
  /@electric-sql\/pglite/,
  /\bPGlite\b/,
  /CREATE EXTENSION/i,
  /import\.meta\.glob\(["']\/migrations\//,
];

export function clientDbProblems(files) {
  const problems = [];
  for (const file of files) {
    const name = String(file.name ?? "");
    if (/(^|\/)(initdb|pglite)[^/]*\.(wasm|data)$/i.test(name)) {
      problems.push(`${name} is a database binary`);
      continue;
    }
    if (!/\.(js|mjs|css|html|wasm)$/i.test(name)) continue;
    const text = String(file.text ?? "");
    for (const marker of TEXT_MARKERS) {
      if (marker.test(text)) {
        problems.push(`${name} matches ${marker}`);
        break;
      }
    }
  }
  return problems;
}

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, acc);
      continue;
    }
    acc.push(path);
  }
  return acc;
}

function run() {
  const files = clientRoots.flatMap((dir) => walk(dir));
  if (files.length === 0) {
    console.error("check-client-db: no client output found. Run vite build first.");
    process.exit(1);
  }
  const scanned = files
    .filter((file) => /\.(js|mjs|css|html|wasm|data)$/i.test(file))
    .map((file) => ({
      name: file.slice(root.length + 1),
      text: /\.(wasm|data)$/i.test(file) ? "" : readFileSync(file, "utf8"),
    }));
  const problems = clientDbProblems(scanned);
  if (problems.length) {
    for (const problem of problems) console.error(`database code in the browser bundle: ${problem}`);
    process.exit(1);
  }
  console.log(`Client bundle has no database schema (${scanned.length} files checked).`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) run();

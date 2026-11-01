/**
 * Download CC BY story files onto this machine and record a SHA-256.
 * Does not leave a hotlink in the manifest. Skips NC and ND.
 * Usage: node --experimental-strip-types scripts/import-story-corner.mjs --limit 1 --lang en
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  GDL_API,
  localBookPath,
  planGdlBook,
  sha256Hex,
  shaMatches,
} from "../src/lib/story-corner/open-books.ts";

const root = process.cwd();
const manifestPath = join(root, "data/story-corner/manifest.json");

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

const limit = Number(arg("--limit", "1"));
const langs = new Set(String(arg("--lang", "en,fr")).split(",").map((part) => part.trim()).filter(Boolean));

async function fetchBytes(url, headers) {
  const response = await fetch(url, { headers, redirect: "follow" });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes;
}

async function saveBook(plan, bytes, fileName) {
  const localPath = localBookPath(plan.id, fileName);
  const absolute = join(root, localPath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
  const readBack = new Uint8Array(await readFile(absolute));
  const sha256 = sha256Hex(bytes);
  if (!shaMatches(readBack, sha256)) throw new Error("Saved file did not match its hash");
  const { remoteFile, ...stored } = plan;
  void remoteFile;
  return { ...stored, sha256, localPath };
}

async function importGdl() {
  const stored = [];
  for (const lang of langs) {
    if (lang !== "en" && lang !== "fr") continue;
    const response = await fetch(`${GDL_API}${lang}?per_page=20`, { headers: { accept: "application/json" } });
    if (!response.ok) continue;
    const body = await response.json();
    const books = Array.isArray(body?.books) ? body.books : Array.isArray(body) ? body : [];
    for (const book of books) {
      if (stored.length >= limit) return stored;
      const plan = planGdlBook(book);
      if (!plan.keep) continue;
      if (plan.plan.language !== lang) continue;
      const bytes = await fetchBytes(plan.plan.remoteFile, { "user-agent": "KidEase-story-corner" });
      if (bytes.byteLength < 32 || bytes.byteLength > 8_000_000) continue;
      const ext = plan.plan.remoteFile.includes(".epub") ? "epub" : "h5p";
      stored.push(await saveBook(plan.plan, bytes, `${plan.plan.id}.${ext}`));
    }
  }
  return stored;
}

const gdl = await importGdl().catch(() => []);
const previous = JSON.parse(await readFile(manifestPath, "utf8").catch(() => "{\"books\":[]}"));
const byId = new Map(
  (previous.books || [])
    .filter((book) => book.source === "gdl" || book.source === "storyweaver")
    .map((book) => [book.id, book]),
);
for (const book of gdl) byId.set(book.id, book);
const books = [...byId.values()];
await writeFile(manifestPath, `${JSON.stringify({ books }, null, 2)}\n`);
process.stdout.write(`Stored ${books.length} local book${books.length === 1 ? "" : "s"}.\n`);

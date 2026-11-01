/**
 * Download CC BY story files onto this machine and record a SHA-256.
 * Does not leave a hotlink in the manifest. Skips NC and ND.
 * Usage: node --experimental-strip-types scripts/import-story-corner.mjs --limit 1 --lang en
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  GDL_API,
  BOOK_DASH_SOURCE,
  bookDashLanguage,
  localBookPath,
  parseBookDashCreators,
  parseBookDashFiles,
  parseBookDashIndex,
  planBookDashFile,
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
  const { remoteFile, remotePath, ...stored } = plan;
  void remoteFile;
  void remotePath;
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

async function importBookDash() {
  const stored = [];
  const indexHtml = await (await fetch(BOOK_DASH_SOURCE, { headers: { "user-agent": "Mozilla/5.0" } })).text();
  const books = parseBookDashIndex(indexHtml).slice(0, 8);
  for (const book of books) {
    if (stored.length >= limit) break;
    const page = await (await fetch(`https://bookdash.org/books/${book.slug}/`, { headers: { "user-agent": "Mozilla/5.0" } })).text();
    const creators = parseBookDashCreators(page.replace(/<[^>]+>/g, " "));
    for (const lang of langs) {
      const folder = lang === "fr" ? `/ebook/fr_french` : `/ebook/en_english`;
      const folderUrl = `${BOOK_DASH_SOURCE}?book=${encodeURIComponent(book.slug)}&folder=${encodeURIComponent(folder)}`;
      const folderHtml = await (await fetch(folderUrl, { headers: { "user-agent": "Mozilla/5.0" } })).text();
      const file = parseBookDashFiles(folderHtml).find((row) => row.name.toLowerCase().endsWith(".pdf") && bookDashLanguage(row.path) === lang);
      if (!file) continue;
      const planned = planBookDashFile({ slug: book.slug, title: book.title, path: file.path, creators });
      if (!planned.keep) continue;
      const download = `${BOOK_DASH_SOURCE}?download=${encodeURIComponent(file.path)}`;
      const bytes = await fetchBytes(download, {
        "user-agent": "Mozilla/5.0",
        referer: folderUrl,
      });
      if (!bytes.slice(0, 4).every((byte, index) => byte === "%PDF".charCodeAt(index))) continue;
      if (bytes.byteLength > 8_000_000) continue;
      stored.push(await saveBook(planned.plan, bytes, file.name));
      break;
    }
  }
  return stored;
}

const gdl = await importGdl().catch(() => []);
const dash = await importBookDash().catch(() => []);
const previous = JSON.parse(await readFile(manifestPath, "utf8").catch(() => "{\"books\":[]}"));
const byId = new Map((previous.books || []).map((book) => [book.id, book]));
for (const book of [...gdl, ...dash]) byId.set(book.id, book);
const books = [...byId.values()];
await writeFile(manifestPath, `${JSON.stringify({ books }, null, 2)}\n`);
process.stdout.write(`Stored ${books.length} local book${books.length === 1 ? "" : "s"}.\n`);

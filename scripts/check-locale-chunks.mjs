/**
 * Fail the production build if an extra language pack is in the first page load.
 *
 * English and French stay in the main copy module. zh, yue, pa, es, ar, tl, it,
 * and de must be separate chunks that are not modulepreloaded from the shell.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const EXTRA_LOCALE_MARKERS = Object.freeze({
  zh: "忘记密码？",
  yue: "唔記得密碼？",
  pa: "ਪਾਸਵਰਡ ਭੁੱਲ ਗਏ?",
  es: "¿Olvidaste tu contraseña?",
  ar: "هل نسيت كلمة المرور؟",
  tl: "Nakalimutan ang password?",
  it: "Ha dimenticato la password?",
  de: "Passwort vergessen?",
});

const clientRoots = [join(root, ".output", "public"), join(root, ".vercel", "output", "static")];

export function localesInText(text) {
  if (typeof text !== "string" || !text) return [];
  return Object.entries(EXTRA_LOCALE_MARKERS)
    .filter(([, marker]) => text.includes(marker))
    .map(([code]) => code);
}

export function preloadedAssetNames(html) {
  const names = new Set();
  if (typeof html !== "string") return names;
  const re = /(?:src|href)=["']([^"']+\.js)["']/g;
  let match = re.exec(html);
  while (match) {
    const name = match[1].split("/").pop();
    if (name) names.add(name);
    match = re.exec(html);
  }
  return names;
}

/** Problems with the client shell. Empty means extra packs are not on the first load. */
export function extraLocalePreloadProblems({ html = "", assets = [] } = {}) {
  const problems = [];
  const inHtml = localesInText(html);
  if (inHtml.length) problems.push(`html contains ${inHtml.join(",")}`);
  const preloaded = preloadedAssetNames(html);
  for (const asset of assets) {
    const codes = localesInText(asset.text);
    if (codes.length > 1) problems.push(`${asset.name} bundles ${codes.join(",")}`);
    if (codes.length && preloaded.has(asset.name)) {
      problems.push(`${asset.name} is preloaded with ${codes.join(",")}`);
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
  const htmlFiles = files.filter((file) => file.endsWith(".html"));
  const jsFiles = files.filter((file) => file.endsWith(".js"));
  if (jsFiles.length === 0) {
    console.error("check-locale-chunks: no client JS found. Run vite build first.");
    process.exit(1);
  }
  const assets = jsFiles.map((file) => ({
    name: file.split("/").pop(),
    text: readFileSync(file, "utf8"),
  }));
  const html = htmlFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  const problems = extraLocalePreloadProblems({ html, assets });
  if (problems.length) {
    for (const problem of problems) console.error(`extra locale on first load: ${problem}`);
    process.exit(1);
  }
  const present = new Set(assets.flatMap((asset) => localesInText(asset.text)));
  const missing = Object.keys(EXTRA_LOCALE_MARKERS).filter((code) => !present.has(code));
  if (missing.length) {
    console.error(`check-locale-chunks: missing lazy chunks for ${missing.join(",")}`);
    process.exit(1);
  }
  console.log(`Locale chunks stay lazy: ${present.size} extra languages, not on the first load.`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) run();

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const dbShim = new URL("./attendance-cross-family-db.mjs", import.meta.url).href;
const shims = new Map([
  ["@/lib/db", dbShim],
  ["@/lib/db.ts", dbShim],
  ["@tanstack/react-start", new URL("./attendance-cross-family-start.mjs", import.meta.url).href],
  [
    "@tanstack/react-start/server",
    new URL("./attendance-cross-family-start-server.mjs", import.meta.url).href,
  ],
]);

function redirectDb(file) {
  return file.endsWith(`${join("src", "lib", "db.ts")}`) ||
    file.endsWith(`${join("src", "lib", "db.js")}`)
    ? dbShim
    : null;
}

function asFile(abs) {
  const tries = [
    abs,
    `${abs}.ts`,
    `${abs}.tsx`,
    `${abs}.mts`,
    `${abs}.mjs`,
    `${abs}.js`,
    join(abs, "index.ts"),
    join(abs, "index.tsx"),
  ];
  for (const file of tries) {
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const shim = shims.get(specifier);
  if (shim) return { url: shim, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const file = asFile(join(srcRoot, specifier.slice(2)));
    if (!file) throw new Error(`Cannot resolve ${specifier}`);
    return { url: redirectDb(file) ?? pathToFileURL(file).href, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
    const file = asFile(join(dirname(fileURLToPath(context.parentURL)), specifier));
    if (file) return { url: redirectDb(file) ?? pathToFileURL(file).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.includes("/node_modules/")) return nextLoad(url, context);
  let path = "";
  try {
    path = fileURLToPath(url);
  } catch {
    return nextLoad(url, context);
  }
  if (!path.endsWith(".ts") && !path.endsWith(".tsx") && !path.endsWith(".mts"))
    return nextLoad(url, context);
  const source = readFileSync(path, "utf8").replaceAll(
    "import.meta.env",
    "globalThis.__kideaseViteEnv",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
    },
    fileName: path,
  }).outputText;
  return { format: "module", source: compiled, shortCircuit: true };
}

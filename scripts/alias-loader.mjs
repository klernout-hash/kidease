import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

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
  if (specifier.startsWith("@/")) {
    const file = asFile(join(srcRoot, specifier.slice(2)));
    if (!file) throw new Error(`Cannot resolve ${specifier}`);
    return nextResolve(pathToFileURL(file).href, context);
  }
  return nextResolve(specifier, context);
}

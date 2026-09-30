import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = fileURLToPath(new URL("../src/", import.meta.url));

function withExt(path) {
  if (/\.(ts|tsx|js|mjs|json|css)$/.test(path)) return path;
  if (existsSync(`${path}.ts`)) return `${path}.ts`;
  if (existsSync(`${path}.tsx`)) return `${path}.tsx`;
  if (existsSync(`${path}.js`)) return `${path}.js`;
  return path;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const path = withExt(srcRoot + specifier.slice(2));
    return { url: pathToFileURL(path).href, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
    const parent = fileURLToPath(context.parentURL);
    const path = withExt(fileURLToPath(new URL(specifier, pathToFileURL(parent))));
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      return { url: pathToFileURL(path).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

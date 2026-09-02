/**
 * Fail the production build if Nitro/Rolldown emitted an invalid ESM chunk.
 *
 * Vite 8.2 + Rolldown 1.2.x can re-export `ssr_exports` from an SSR service
 * chunk that never declares it. `vite build` still exits 0; Node throws
 * `SyntaxError: Export 'ssr_exports' is not defined in module` the first
 * time the serverless function is compiled — GET /, get-session, and
 * /_serverFn all 500.
 *
 * @see https://github.com/TanStack/router/issues/8031
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const searchRoots = [
  join(root, ".vercel", "output", "functions"),
  join(root, ".output", "server"),
];

function walkJs(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walkJs(p, acc);
      continue;
    }
    if (name.endsWith(".mjs") || name.endsWith(".js")) acc.push(p);
  }
  return acc;
}

export function undeclaredSsrExports(source) {
  const reexports = /export\s*\{[^}]*\bssr_exports\b/.test(source);
  if (!reexports) return false;
  const declared =
    /\b(?:var|let|const)\s+ssr_exports\b/.test(source) ||
    /\bssr_exports\s*=/.test(source) ||
    /\bimport\s*\{[^}]*\bssr_exports\b/.test(source) ||
    /\bimport\s+\*\s+as\s+ssr_exports\b/.test(source);
  return !declared;
}

const files = searchRoots.flatMap((dir) => walkJs(dir));
const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  if (files.length === 0) {
    console.error(
      "check-ssr-bundle: no Nitro/Vercel server output found. Run vite build first.",
    );
    process.exit(1);
  }

  let failed = 0;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (undeclaredSsrExports(source)) {
      console.error(`undeclared ssr_exports re-export: ${file}`);
      failed += 1;
    }
    try {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    } catch (err) {
      const stderr = err && typeof err === "object" && "stderr" in err ? err.stderr : "";
      console.error(`node --check failed: ${file}`);
      if (stderr) console.error(String(stderr));
      failed += 1;
    }
  }

  if (failed) {
    console.error(`check-ssr-bundle: ${failed} invalid server module(s)`);
    process.exit(1);
  }
  console.log(`ESM output check passed: ${files.length} server modules link cleanly.`);
}

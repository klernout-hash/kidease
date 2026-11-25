/**
 * iPhone Duo guard (C5). The cover display keeps an ~84pt status-bar strip on
 * one side. The shell pads for it, but a `fixed` layer escapes the shell, so
 * every fixed full-width layer must pad itself: `ke-safe-x` (styles.css), or
 * its own safe-area-inset / --ke-safe-left|right padding. Pure backdrops (a
 * bg-fg/ or bg-black/ tint with no children) may stay edge to edge.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

/** Blank out comments but keep offsets, so line numbers stay right. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, lead) => lead + " ".repeat(m.length - lead.length));
}

const EDGE = /^(?:[a-z0-9-]+:)*(?:inset-x-0|inset-0|left-0|right-0)$/;
const FIXED = /^(?:[a-z0-9-]+:)*fixed$/;
const SAFE = /ke-safe-x|safe-area-inset-left|safe-area-inset-right|ke-safe-left|ke-safe-right/;
const BACKDROP = /(?:^|\s)bg-(?:fg|black)\/\d+/;

/** True when the element that owns this class string has no children (`<x ... />` or `<x ...></x>`). */
function childless(source, end) {
  let depth = 0;
  for (let i = end; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (depth === 0 && ch === ">") {
      if (source[i - 1] === "/") return true;
      return /^\s*<\//.test(source.slice(i + 1, i + 80));
    }
  }
  return false;
}

export function unsafeFixedLayers(files) {
  const found = [];
  for (const file of files) {
    const source = stripComments(readFileSync(file, "utf8"));
    for (const match of source.matchAll(/(["`])((?:(?!\1)[^\n\\]|\\.)*)\1/g)) {
      const classes = match[2];
      const tokens = classes.split(/\s+/);
      if (!tokens.some((t) => FIXED.test(t)) || !tokens.some((t) => EDGE.test(t))) continue;
      if (SAFE.test(classes)) continue;
      if (BACKDROP.test(classes) && childless(source, match.index + match[0].length)) continue;
      const line = source.slice(0, match.index).split("\n").length;
      found.push(`${relative(root, file)}:${line} ${classes.slice(0, 80)}`);
    }
  }
  return found;
}

test("every fixed full-width layer keeps its content clear of the side strip", () => {
  const files = walk(join(root, "src"));
  assert.ok(files.length > 50);
  assert.deepEqual(unsafeFixedLayers(files), []);
});

test("the shared utility pads each side from its own inset", () => {
  const css = readFileSync(join(root, "src/styles.css"), "utf8");
  assert.match(css, /\.ke-safe-x \{\s*padding-left: max\(var\(--ke-pad-x, 0px\), var\(--ke-safe-left, 0px\)\);\s*padding-right: max\(var\(--ke-pad-x, 0px\), var\(--ke-safe-right, 0px\)\);/);
  // The two-value shorthand mirrors one side's inset onto the other.
  assert.doesNotMatch(css, /padding(?:-inline)?:\s*[^;]*\benv\(safe-area-inset-(?:left|right)[^;]*\benv\(safe-area-inset-(?:left|right)/);
  assert.doesNotMatch(css, /padding:\s*0 env\(safe-area-inset-left\)/);
  // The help button follows the same inset variable the shell uses.
  assert.doesNotMatch(css, /\.ke-help-bot \{[^}]*right: max\([^,;]+, env\(safe-area-inset-right/);
  for (const file of ["gov/gov-frame.tsx", "gov/gov-login.tsx", "gov/gov-exports.tsx", "compliance/frame.tsx"]) {
    assert.match(readFileSync(join(root, "src/components", file), "utf8"), /pl-\[var\(--ke-safe-left/);
  }
});

test("the guard catches an unpadded sheet host and lets a bare backdrop through", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "duo-safe-"));
  try {
    const bad = join(dir, "bad.tsx");
    const ok = join(dir, "ok.tsx");
    writeFileSync(bad, 'export const A = () => <div className="fixed inset-0 z-50 flex items-end p-4"><button>Go</button></div>;\n');
    writeFileSync(
      ok,
      'export const B = () => (<>\n<div className="fixed inset-0 z-50 bg-fg/40" />\n<div className="ke-safe-x fixed inset-x-0 bottom-0 [--ke-pad-x:1rem]"><button>Go</button></div>\n</>);\n',
    );
    assert.equal(unsafeFixedLayers([bad]).length, 1);
    assert.deepEqual(unsafeFixedLayers([ok]), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

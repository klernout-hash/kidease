/**
 * Vite client transform: static `node:` imports throw in the browser on /login
 * because the route tree evaluates every route. Rewrite those imports into
 * lazy lookups so the module can load. Server bundles are not transformed.
 */

const IMPORT_RE = /import\s+(?!type\b)\{([^}]*)\}\s+from\s+["'](node:[^"']+)["']\s*;?/g;

function parseSpecifiers(inner) {
  const specs = [];
  for (const raw of inner.split(",")) {
    const piece = raw.trim();
    if (!piece) continue;
    if (piece.startsWith("type ")) continue;
    const alias = piece.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (alias) {
      specs.push({ imported: alias[1], local: alias[2] });
      continue;
    }
    if (!/^[A-Za-z_$][\w$]*$/.test(piece)) {
      throw new Error(`Cannot rewrite node import specifier: ${piece}`);
    }
    specs.push({ imported: piece, local: piece });
  }
  return specs;
}

function bindingFor(moduleId, imported, local) {
  if (moduleId === "node:async_hooks" && imported === "AsyncLocalStorage") {
    return `const ${local} = (() => {
  const mod = __keNodeBuiltin(${JSON.stringify(moduleId)});
  if (mod && mod.AsyncLocalStorage) return mod.AsyncLocalStorage;
  return class AsyncLocalStorage {
    constructor() { this._store = undefined; }
    getStore() { return this._store; }
    run(value, fn) {
      const prev = this._store;
      this._store = value;
      try { return fn(); } finally { this._store = prev; }
    }
    enterWith(value) { this._store = value; }
  };
})();`;
  }
  if (moduleId === "node:path" && (imported === "join" || imported === "dirname" || imported === "resolve")) {
    return `function ${local}(...args) {
  const mod = __keNodeBuiltin(${JSON.stringify(moduleId)});
  if (mod && typeof mod[${JSON.stringify(imported)}] === "function") return mod[${JSON.stringify(imported)}](...args);
  return args.map((part) => String(part ?? "").replace(/^\\/+|\\/+$/g, "")).filter(Boolean).join("/");
}`;
  }
  return `function ${local}(...args) {
  const mod = __keNodeBuiltin(${JSON.stringify(moduleId)});
  if (!mod || typeof mod[${JSON.stringify(imported)}] !== "function") {
    throw new Error(${JSON.stringify(`${moduleId}.${imported} is server-only`)});
  }
  return mod[${JSON.stringify(imported)}](...args);
}`;
}

export function rewriteNodeBuiltinImports(code) {
  if (!code.includes("node:")) return code;
  const bindings = [];
  let matched = false;
  const next = code.replace(IMPORT_RE, (full, inner, moduleId) => {
    const specs = parseSpecifiers(inner);
    if (specs.length === 0) return full;
    matched = true;
    for (const spec of specs) bindings.push(bindingFor(moduleId, spec.imported, spec.local));
    return "";
  });
  if (!matched) return code;
  const header = `import { nodeBuiltin as __keNodeBuiltin } from "@/lib/node-builtin";\n${bindings.join("\n")}\n`;
  return header + next;
}

export function clientNodeBuiltinStub() {
  return {
    name: "kidease:client-node-builtin-stub",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment?.name === "client";
    },
    transform(code, id) {
      if (!id || id.includes("node_modules") || id.includes("\0")) return null;
      if (!code.includes('from "node:') && !code.includes("from 'node:")) return null;
      const rewritten = rewriteNodeBuiltinImports(code);
      if (rewritten === code) return null;
      return { code: rewritten, map: null };
    },
  };
}

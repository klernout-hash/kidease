/**
 * Node builtin lookup that does not throw while the browser evaluates a module.
 *
 * A static `import { createHmac } from "node:crypto"` crashes Vite's client
 * graph (the externalized module throws on property access). The client
 * transform calls this helper instead, and only when a function actually runs.
 * Server code keeps its real `node:` imports.
 */
export function nodeBuiltin(id: string): Record<string, (...args: never[]) => unknown> | null {
  const proc = globalThis.process as { getBuiltinModule?: (specifier: string) => unknown } | undefined;
  if (!proc || typeof proc.getBuiltinModule !== "function") return null;
  const mod = proc.getBuiltinModule(id);
  if (!mod || typeof mod !== "object") return null;
  return mod as Record<string, (...args: never[]) => unknown>;
}

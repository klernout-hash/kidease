import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { cn } from "../../src/lib/utils.ts";
import { canVisitDesk } from "../../src/lib/desks.ts";
import { withTimeout } from "../../src/lib/timeout.ts";
import {
  adminQueueProofMatches,
  createAdminQueueRequestGuard,
} from "../../src/lib/admin-queue-bootstrap-state.ts";

// Synthetic authorization dependencies only; no app transport or financial modules.
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
export const proof = (extra = {}) => {
  const checkedAt = Date.now();
  return {
    viewerId: "synthetic-a",
    sessionId: "session-a",
    checkedAt,
    expiresAt: checkedAt + 15_000,
    counts: { status: "ready", waiting: 7, approved: 4, declined: 2, all: 13 },
    ...extra,
  };
};
function compile(path, dependencies) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(join(root, path), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new vm.Script(code).runInNewContext({
    module,
    exports: module.exports,
    require: (name) => dependencies[name] ?? require(name),
  });
  return module.exports;
}
const Link = ({ to, search, children, ...props }) =>
  createElement(
    "a",
    { ...props, href: to + (search ? `?${new URLSearchParams(search)}` : "") },
    children,
  );
export function renderFixture(initial, locale = "en", overrides = {}) {
  const { Button } = compile("src/components/ui/button.tsx", { "@/lib/utils": { cn } });
  const { AdminQueueBootstrapFallback } = compile("src/components/admin-queue-bootstrap.tsx", {
    "@tanstack/react-router": { Link },
    "@/components/ui/button": { Button },
    "@/components/shell": {
      Shell: ({ children }) =>
        createElement("div", { className: "min-h-dvh w-full overflow-x-hidden" }, children),
    },
    "@/components/session-desks": {
      useSessionDesks: () => ({ ready: false, session: null, error: false }),
    },
    "@/lib/auth/client": {
      authClient: { useSession: () => ({ data: null, isPending: true, error: null }) },
    },
    "@/lib/auth/use-current-user": { useLocallySignedOut: () => false },
    "@/lib/desks": { canVisitDesk },
    "@/lib/admin-queue-bootstrap-state": { adminQueueProofMatches, createAdminQueueRequestGuard },
    "@/lib/server/admin-queue-bootstrap": {
      loadAdminQueueBootstrap: () => {
        throw new Error("SSR must not run a client request");
      },
    },
    "@/lib/timeout": { LOADER_SETTLE_MS: 80, withTimeout },
    "@/lib/use-copy": { useCopy: () => ({ locale }) },
    ...overrides,
  });
  return renderToString(createElement(AdminQueueBootstrapFallback, { initial }));
}

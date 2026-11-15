// This module configures Zod before later static schema construction.
// The real call below keeps that initialization in the production bundle.
import { installZodCsp } from "./lib/zod-csp";
// Eligible Sentry starts before the first React render.
import { instrumentationReady } from "./instrument.client";

import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { installServerFnFetchGate } from "./lib/server-fn-client";
import { ensureFrenchCopy } from "./lib/copy-runtime";
import { readLocaleCookie } from "./lib/locale-geo";
import { afterBrowserInstrumentation } from "./lib/sentry-browser-start";

installZodCsp();
installServerFnFetchGate();

function paint() {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    );
  });
}

const path = window.location.pathname;
function savedFrench(): boolean {
  if (readLocaleCookie(document.cookie) === "fr") return true;
  try {
    return window.localStorage.getItem("kidease-locale") === "fr";
  } catch {
    return false;
  }
}
const french = path === "/fr" || path.startsWith("/fr/") || savedFrench();
const copyReady = french ? ensureFrenchCopy() : null;
const ready = copyReady ? Promise.all([instrumentationReady, copyReady]) : instrumentationReady;
afterBrowserInstrumentation(ready, paint);

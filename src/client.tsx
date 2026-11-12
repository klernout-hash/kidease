// Before Sentry and route code. Zod's first object parse probes `new Function`,
// and CSP reports that even when the throw is caught.
import { zodCspInstalled } from "./lib/zod-csp";
// Eligible Sentry starts before the first React render.
import { instrumentationReady } from "./instrument.client";

import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { installServerFnFetchGate } from "./lib/server-fn-client";
import { ensureFrenchCopy } from "./lib/copy-runtime";
import { afterBrowserInstrumentation } from "./lib/sentry-browser-start";

void zodCspInstalled;
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
const french = path === "/fr" || path.startsWith("/fr/");
const copyReady = french ? ensureFrenchCopy() : null;
const ready = copyReady ? Promise.all([instrumentationReady, copyReady]) : instrumentationReady;
afterBrowserInstrumentation(ready, paint);

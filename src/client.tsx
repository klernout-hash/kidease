// Before Sentry and route code. Zod's first object parse probes `new Function`,
// and CSP reports that even when the throw is caught.
import { zodCspInstalled } from "./lib/zod-csp";
// Sentry first so unhandled errors before hydrate are captured.
import "./instrument.client";

import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { installServerFnFetchGate } from "./lib/server-fn-client";
import { ensureFrenchCopy } from "./lib/copy-runtime";

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
if (french) void ensureFrenchCopy().then(paint);
else paint();

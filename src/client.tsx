// Before Sentry and route code. Zod's first object parse probes `new Function`,
// and CSP reports that even when the throw is caught.
import { zodCspInstalled } from "./lib/zod-csp";
// Sentry first so unhandled errors before hydrate are captured.
import "./instrument.client";

import { StartClient } from "@tanstack/react-start/client";
import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";

void zodCspInstalled;

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});

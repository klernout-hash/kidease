import { createServerFn } from "@tanstack/react-start";
import { showPayCtas, subscriptionsEnabled } from "@/lib/features";

/** Public chrome flags. No auth. Search and listing need the same gate. */
export const getUiChrome = createServerFn({ method: "GET" }).handler(async () => ({
  showPayCtas: showPayCtas(),
  subscriptionsEnabled: subscriptionsEnabled(),
}));

/** Plans page gate. Always read on the server so the browser cannot flip it. */
export const getPlansGate = createServerFn({ method: "GET" }).handler(async () => ({
  subscriptionsOn: subscriptionsEnabled(),
}));

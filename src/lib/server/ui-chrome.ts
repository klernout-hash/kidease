import { createServerFn } from "@tanstack/react-start";
import { showPayCtas, subscriptionsEnabled } from "@/lib/features";
import { plansOpenInShell, storeChannelFromSignals, type StoreChannel } from "@/lib/native-entitlements";

/** Public chrome flags. No auth. Search and listing need the same gate. */
export const getUiChrome = createServerFn({ method: "GET" }).handler(async () => ({
  showPayCtas: showPayCtas(),
  subscriptionsEnabled: subscriptionsEnabled(),
}));

async function requestStoreChannel(): Promise<StoreChannel> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    let search = "";
    try {
      search = new URL(req?.url || "", "https://www.kidease.ca").search;
    } catch {
      search = "";
    }
    return storeChannelFromSignals({
      userAgent: req?.headers.get("user-agent"),
      cookie: req?.headers.get("cookie"),
      search,
    });
  } catch {
    return "web";
  }
}

/** Plans page gate. Always read on the server so the browser cannot flip it. */
export const getPlansGate = createServerFn({ method: "GET" }).handler(async () => {
  const subscriptionsOn = subscriptionsEnabled();
  const channel = await requestStoreChannel();
  return {
    subscriptionsOn,
    inStoreApp: channel !== "web",
    plansOpen: plansOpenInShell({ subscriptionsOn, channel }),
  };
});

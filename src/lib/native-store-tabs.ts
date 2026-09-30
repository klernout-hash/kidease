/**
 * Capacitor bottom tabs for a parent or a guest.
 * Daycare and admin keep their desk bars. Messages is the real inbox,
 * not an SMS or live-chat stub.
 */
export type NativeStoreTabId = "search" | "saved" | "messages" | "account";

export type NativeStoreTab = {
  id: NativeStoreTabId;
  to: "/" | "/parent" | "/inbox" | "/account";
  search?: Record<string, string>;
};

const STORE_TABS: NativeStoreTab[] = [
  { id: "search", to: "/" },
  { id: "saved", to: "/parent", search: { tab: "saved" } },
  { id: "messages", to: "/inbox", search: { view: "family" } },
  { id: "account", to: "/account" },
];

export function nativeStoreTabs(
  kind: "guest" | "parent" | "daycare" | "admin",
): NativeStoreTab[] | null {
  if (kind === "guest" || kind === "parent") return STORE_TABS;
  return null;
}

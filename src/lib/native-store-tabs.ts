/**
 * Native uses the same role tab bars as the phone website.
 * The last tab is Menu. This stays so older callers still compile.
 */
export type NativeStoreTabId = "search" | "saved" | "messages" | "account";

export type NativeStoreTab = {
  id: NativeStoreTabId;
  to: "/" | "/parent" | "/inbox" | "/account";
  search?: Record<string, string>;
};

export function nativeStoreTabs(
  _kind: "guest" | "parent" | "daycare" | "admin",
): NativeStoreTab[] | null {
  return null;
}

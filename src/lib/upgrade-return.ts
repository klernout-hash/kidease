export type UpgradeReturn =
  | { phase: "cancel" }
  | {
      phase: "success";
      kind: "plan" | "addon" | "plus";
      item: string | null;
      sessionId: string | null;
      interval: string | null;
    };

export type UpgradeSearch = {
  checkout?: string | null;
  addon?: string | null;
  plus?: string | null;
  plan?: string | null;
  item?: string | null;
  session?: string | null;
  interval?: string | null;
};

/** Same return on the website and in the in-app webview. The router search is the source. */
export function upgradeReturnFromSearch(search: UpgradeSearch | null | undefined): UpgradeReturn | null {
  if (!search) return null;
  const sessionId = String(search.session || "").trim() || null;
  const interval = search.interval === "year" || search.interval === "month" ? search.interval : null;
  if (search.checkout === "cancel" || search.addon === "cancel" || search.plus === "cancel") {
    return { phase: "cancel" };
  }
  if (search.checkout === "success") {
    return { phase: "success", kind: "plan", item: search.plan || null, sessionId, interval };
  }
  if (search.addon === "success") {
    return { phase: "success", kind: "addon", item: search.item || null, sessionId, interval: null };
  }
  if (search.plus === "success") {
    const plan = search.plan === "alerts" ? "alerts" : "plus";
    return { phase: "success", kind: "plus", item: plan, sessionId, interval };
  }
  return null;
}

export function readUpgradeReturn(search: string): UpgradeReturn | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return upgradeReturnFromSearch({
    checkout: params.get("checkout"),
    addon: params.get("addon"),
    plus: params.get("plus"),
    plan: params.get("plan"),
    item: params.get("item"),
    session: params.get("session"),
    interval: params.get("interval"),
  });
}

export const UPGRADE_CONFIRM_POLL_MS = 2000;
export const UPGRADE_CONFIRM_WAIT_MS = 20000;

export const UPGRADE_CONFIRMING = {
  en: "Confirming your upgrade…",
  fr: "Confirmation de votre option…",
} as const;

export const UPGRADE_CONFIRM_SLOW = {
  en: "Still confirming. Refresh in a minute, or open Manage billing. If the card was charged, the upgrade appears when Stripe notifies KidEase. Nothing is marked paid before that.",
  fr: "Confirmation toujours en cours. Actualisez dans une minute, ou ouvrez Gérer la facturation. Si la carte a été débitée, l’option apparaît quand Stripe prévient KidEase. Rien n’est marqué payé avant.",
} as const;

export function upgradeCelebrationKey(ret: Extract<UpgradeReturn, { phase: "success" }>): string {
  return `kidease-pay-success:${ret.kind}:${ret.sessionId || ret.item || "paid"}`;
}

/** Drop a success return from the URL so a refresh does not celebrate again. */
export function stripUpgradeReturnQuery(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const success =
    params.get("checkout") === "success" || params.get("addon") === "success" || params.get("plus") === "success";
  if (!success) return search.startsWith("?") ? search : search ? `?${search}` : "";
  if (params.get("checkout") === "success") params.delete("checkout");
  if (params.get("addon") === "success") params.delete("addon");
  if (params.get("plus") === "success") params.delete("plus");
  params.delete("session");
  params.delete("plan");
  params.delete("item");
  params.delete("interval");
  const next = params.toString();
  return next ? `?${next}` : "";
}

import type { CopyKey } from "./copy-en.ts";
import { stripLocalePrefix } from "./locale-path.ts";

/**
 * In-app screen stack keyed by the router history index.
 * Back buttons read the previous entry. A cold visit (no earlier entry)
 * falls back to the parent route. Re-recording an index drops anything
 * above it, so Back from Wallet returns to Profile and the next Back
 * continues to Menu instead of bouncing into Wallet again.
 */
export type ScreenCrumb = {
  href: string;
  labelKey: CopyKey;
};

export type HistoryBackDecision = {
  via: "history" | "fallback";
  href: string;
  labelKey: CopyKey;
};

const stack = new Map<number, ScreenCrumb>();

export function resetScreenHistory(): void {
  stack.clear();
}

export function readHistoryIndex(state: unknown): number {
  if (!state || typeof state !== "object") return 0;
  const rec = state as Record<string, unknown>;
  if (typeof rec.__TSR_index === "number") return rec.__TSR_index;
  if (typeof rec.idx === "number") return rec.idx;
  const nested = rec.__TSR;
  if (nested && typeof nested === "object" && typeof (nested as { index?: unknown }).index === "number") {
    return (nested as { index: number }).index;
  }
  return 0;
}

function appendValue(params: URLSearchParams, key: string, value: unknown): void {
  if (value == null || value === "") return;
  if (Array.isArray(value)) {
    const flat = value.filter((item) => item != null && item !== "").map(String);
    if (flat.length) params.set(key, flat.join(","));
    return;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    params.set(key, String(value));
  }
}

/** Stable `?a=1&b=2` (sorted) so the same screen compares equal. */
export function searchRecordToString(search: unknown): string {
  if (!search || typeof search !== "object") return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search as Record<string, unknown>)) {
    appendValue(params, key, value);
  }
  params.sort();
  const q = params.toString();
  return q ? `?${q}` : "";
}

export function hrefFor(pathname: string, search?: unknown): string {
  return `${pathname}${searchRecordToString(search)}`;
}

export function historyHref(path: string, search?: object): string {
  return hrefFor(path, search);
}

export function labelKeyForLocation(pathname: string, search?: unknown): CopyKey {
  const path = stripLocalePrefix(pathname);
  const params = new URLSearchParams(searchRecordToString(search).slice(1));
  if (path === "/" || path === "/search") return "search";
  if (path === "/menu" || path.startsWith("/menu/")) {
    const screen = params.get("screen");
    if (screen === "earnings") return "earningsTitle";
    if (screen === "insights") return "insightsTitle";
    if (screen === "payments") return "earningsPayments";
    const section = params.get("section");
    if (section === "legal") return "menuPrivacyLegal";
    if (section === "help") return "menuGetHelp";
    if (section === "guides") return "menuGuides";
    if (section === "resources") return "menuResources";
    return "navMenu";
  }
  if (path === "/provider" || path.startsWith("/provider/")) return "daycareDeskTitle";
  if (path === "/parent" || path.startsWith("/parent/")) return "familyDeskTitle";
  if (path === "/admin" || path.startsWith("/admin")) return "deskAdmin";
  if (path === "/support" || path.startsWith("/support")) return "support";
  if (path === "/account") {
    switch (params.get("section")) {
      case "wallet":
        return "walletTitle";
      case "alerts":
        return "accountAlerts";
      case "security":
        return "loginSecurity";
      case "appearance":
        return "appearance";
      case "documents":
        return "familyDocs";
      case "email-sms":
        return "emailAndSms";
      case "refer":
        return "referFriend";
      case "subscription":
        return "navUpgrade";
      case "delete":
        return "deleteAccount";
      default:
        return "profile";
    }
  }
  if (path.startsWith("/inbox")) return params.get("view") === "centre" ? "messages" : "inbox";
  if (path === "/privacy") return "privacy";
  if (path === "/terms") return "terms";
  if (path === "/cookies") return "cookies";
  return "back";
}

export function recordScreen(index: number, crumb: ScreenCrumb): void {
  stack.set(index, crumb);
  for (const key of [...stack.keys()]) {
    if (key > index) stack.delete(key);
  }
}

export function resolveHistoryBack(input: {
  index: number;
  currentHref: string;
  fallbackHref: string;
  fallbackLabelKey: CopyKey;
  crumbs?: ReadonlyMap<number, ScreenCrumb>;
}): HistoryBackDecision {
  const crumbs = input.crumbs ?? stack;
  const prev = input.index > 0 ? crumbs.get(input.index - 1) : undefined;
  if (prev && prev.href && prev.href !== input.currentHref) {
    return { via: "history", href: prev.href, labelKey: prev.labelKey };
  }
  return {
    via: "fallback",
    href: input.fallbackHref,
    labelKey: input.fallbackLabelKey,
  };
}

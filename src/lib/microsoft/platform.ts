/**
 * Microsoft Store PWA extras. Each flag defaults off.
 * Off means the static manifest is unchanged and these helpers add no fields.
 *
 * No @/ imports. scripts/microsoft-platform.test.mjs loads this file in Node.
 */

import { evaluateFeatureFlag, type EnvMap } from "../flags.ts";

export const MS_SHARE_FLAG = "FEATURE_MS_SHARE_TARGET";
export const MS_PROTOCOL_FLAG = "FEATURE_MS_PROTOCOL_HANDLERS";
export const MS_WIDGETS_FLAG = "FEATURE_MS_WIDGETS";
export const MS_SHORTCUTS_FLAG = "FEATURE_MS_SHORTCUTS";
export const MS_BADGING_FLAG = "FEATURE_MS_BADGING";
export const MS_STORE_LINK_FLAG = "FEATURE_MS_STORE_LINK";

export type MicrosoftManifest = Record<string, unknown>;

export type MicrosoftPlatformMarks = {
  msShareTarget?: true;
  msProtocol?: true;
  msWidgets?: true;
  msShortcuts?: true;
  msBadging?: true;
  msStoreUrl?: string;
};

const PRODUCT_ID = /^9[A-Z0-9]{11}$/;

function on(env: EnvMap | undefined, key: typeof MS_SHARE_FLAG | typeof MS_PROTOCOL_FLAG | typeof MS_WIDGETS_FLAG | typeof MS_SHORTCUTS_FLAG | typeof MS_BADGING_FLAG | typeof MS_STORE_LINK_FLAG): boolean {
  return evaluateFeatureFlag(key, env);
}

export function microsoftStoreUrl(env?: EnvMap): string | null {
  if (!on(env, MS_STORE_LINK_FLAG)) return null;
  const id = String(env?.MICROSOFT_STORE_PRODUCT_ID || "")
    .trim()
    .toUpperCase();
  if (!PRODUCT_ID.test(id)) return null;
  return `https://apps.microsoft.com/detail/${id}`;
}

export function microsoftStoreDeepLink(webUrl: string | null): string | null {
  if (!webUrl) return null;
  const id = webUrl.split("/").pop() || "";
  if (!PRODUCT_ID.test(id)) return null;
  return `ms-windows-store://pdp/?productid=${id}`;
}

/** True keys only. An all-off env adds nothing to the store-channel payload. */
export function microsoftPlatformContext(env?: EnvMap): MicrosoftPlatformMarks {
  const out: MicrosoftPlatformMarks = {};
  if (on(env, MS_SHARE_FLAG)) out.msShareTarget = true;
  if (on(env, MS_PROTOCOL_FLAG)) out.msProtocol = true;
  if (on(env, MS_WIDGETS_FLAG)) out.msWidgets = true;
  if (on(env, MS_SHORTCUTS_FLAG)) out.msShortcuts = true;
  if (on(env, MS_BADGING_FLAG)) out.msBadging = true;
  const store = microsoftStoreUrl(env);
  if (store) out.msStoreUrl = store;
  return out;
}

export function microsoftManifestActive(env?: EnvMap): boolean {
  return on(env, MS_SHARE_FLAG) || on(env, MS_PROTOCOL_FLAG) || on(env, MS_WIDGETS_FLAG) || on(env, MS_SHORTCUTS_FLAG);
}

/** Copy of the static manifest plus extras for flags that are on. */
export function withMicrosoftExtras(base: MicrosoftManifest, env?: EnvMap): MicrosoftManifest {
  const next: MicrosoftManifest = structuredClone(base);
  if (on(env, MS_SHARE_FLAG)) {
    next.share_target = {
      action: "/search",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    };
  }
  if (on(env, MS_PROTOCOL_FLAG)) {
    next.protocol_handlers = [{ protocol: "web+kidease", url: "/search?q=%s" }];
  }
  if (on(env, MS_SHORTCUTS_FLAG)) {
    next.shortcuts = [
      {
        name: "Search daycares",
        short_name: "Search",
        url: "/search",
        description: "Find licensed childcare in Canada.",
      },
      { name: "Help", short_name: "Help", url: "/help", description: "Write to KidEase." },
    ];
  }
  if (on(env, MS_WIDGETS_FLAG)) {
    next.widgets = [
      {
        name: "KidEase search",
        short_name: "Search",
        description: "Find licensed childcare in Canada.",
        tag: "kidease-search",
        template: "schema.org/SearchAction",
        ms_ac_template: "schema.org/SearchAction",
        data: "/api/microsoft-widget",
        auth: false,
        update: 3600,
        icons: [{ src: "/icons/icon-192.png?v=20", sizes: "192x192", type: "image/png" }],
      },
    ];
  }
  return next;
}

/** Widget feed. Null unless FEATURE_MS_WIDGETS is on. No centre names or fees. */
export function microsoftWidgetData(env?: EnvMap): Record<string, string> | null {
  if (!on(env, MS_WIDGETS_FLAG)) return null;
  return {
    "@context": "https://schema.org",
    "@type": "SearchAction",
    target: "https://www.kidease.ca/search?q={q}",
    "query-input": "required name=q",
  };
}

/** Skip unless the flag is on and the count is a whole number. */
export function microsoftBadgeAction(flagOn: boolean, count: number | null): "skip" | "set" | "clear" {
  if (!flagOn || count == null || !Number.isInteger(count) || count < 0 || count > 99) return "skip";
  return count === 0 ? "clear" : "set";
}

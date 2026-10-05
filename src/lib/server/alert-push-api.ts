import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { ALERT_CATEGORIES, isAlertCategory, type AlertPrefMap } from "@/lib/alert-push";
import { pushArmed } from "@/lib/channel-readiness";
import { pushEnvPresence } from "@/lib/push";
import { subscriptionsEnabled } from "@/lib/features";

export type WebAlertStatus = {
  pushArmed: boolean;
  vapid: boolean;
  subscriptionsOn: boolean;
};

export const getWebAlertStatus = createServerFn({ method: "GET" }).handler(async (): Promise<WebAlertStatus> => {
  return {
    pushArmed: pushArmed(),
    vapid: pushEnvPresence().vapid,
    subscriptionsOn: subscriptionsEnabled(),
  };
});

export const getMyAlertPrefs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AlertPrefMap> => {
    const { readAlertPrefs } = await import("./alert-dispatch");
    return readAlertPrefs(context.userId);
  });

export const saveMyAlertPrefs = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { items?: Array<{ category?: string; enabled?: boolean }> }) => {
    const items = Array.isArray(input?.items) ? input.items : [];
    return {
      items: items
        .map((item) => ({
          category: String(item?.category || "").trim(),
          enabled: item?.enabled === true,
        }))
        .filter((item) => isAlertCategory(item.category))
        .slice(0, ALERT_CATEGORIES.length),
    };
  })
  .handler(async ({ context, data }): Promise<AlertPrefMap> => {
    const { writeAlertPrefs } = await import("./alert-dispatch");
    return writeAlertPrefs(context.userId, data.items);
  });

export const registerWebPush = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { endpoint?: string; p256dh?: string; authKey?: string; locale?: string }) => ({
    endpoint: String(input?.endpoint || "").trim(),
    p256dh: String(input?.p256dh || "").trim(),
    authKey: String(input?.authKey || "").trim(),
    locale: input?.locale ? String(input.locale).trim() : undefined,
  }))
  .handler(async ({ context, data }) => {
    const { upsertWebPushSubscription } = await import("./alert-dispatch");
    return upsertWebPushSubscription(context.userId, data);
  });

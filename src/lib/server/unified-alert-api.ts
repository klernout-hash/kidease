import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { isValidTimeZone } from "@/lib/family-time";
import {
  CANADA_TIME_ZONES,
  DIGEST_MODES,
  alertsForAudience,
  isUnifiedAlertType,
  parseClock,
  type DigestMode,
  type UnifiedAudience,
  type UnifiedSettings,
} from "@/lib/unified-alerts";

function clock(value: unknown, fallback: string): string {
  const text = String(value || "").trim();
  return parseClock(text) == null ? fallback : text;
}

export const loadUnifiedAlertDesk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { native?: boolean }) => ({ native: input?.native === true }))
  .handler(async ({ context, data }) => {
    const { unifiedDesk } = await import("./unified-alerts");
    return unifiedDesk(context.userId, data.native);
  });

export const saveUnifiedAlertDesk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    settings?: Partial<UnifiedSettings>;
    prefs?: Array<{ typeId?: string; enabled?: boolean }>;
  }) => {
    const digest = DIGEST_MODES.includes(input?.settings?.digest as DigestMode)
      ? (input?.settings?.digest as DigestMode)
      : "off";
    const zone = isValidTimeZone(input?.settings?.timeZone) ? String(input?.settings?.timeZone) : "America/Winnipeg";
    return {
      settings: {
        master: input?.settings?.master !== false,
        inApp: input?.settings?.inApp !== false,
        email: input?.settings?.email !== false,
        push: input?.settings?.push === true,
        quietStart: clock(input?.settings?.quietStart, "21:00"),
        quietEnd: clock(input?.settings?.quietEnd, "08:00"),
        quietCustom: input?.settings?.quietCustom === true,
        timeZone: zone,
        digest,
      } satisfies UnifiedSettings,
      prefs: (Array.isArray(input?.prefs) ? input.prefs : [])
        .map((pref) => ({ typeId: String(pref?.typeId || "").trim(), enabled: pref?.enabled !== false }))
        .filter((pref) => isUnifiedAlertType(pref.typeId))
        .slice(0, 80),
    };
  })
  .handler(async ({ context, data }) => {
    const { writeUnifiedSettings, unifiedDesk } = await import("./unified-alerts");
    await writeUnifiedSettings(context.userId, data.settings, data.prefs);
    return unifiedDesk(context.userId, false);
  });

export const markUnifiedAlertRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; all?: boolean }) => ({
    id: String(input?.id || "").trim(),
    all: input?.all === true,
  }))
  .handler(async ({ context, data }) => {
    const { markUnifiedRead } = await import("./unified-alerts");
    await markUnifiedRead(context.userId, data);
    return { ok: true as const };
  });

export function visibleAlertIds(audiences: UnifiedAudience[]): string[] {
  return audiences.flatMap((audience) => alertsForAudience(audience).map((row) => row.id));
}

export const CANADA_ZONES = CANADA_TIME_ZONES;

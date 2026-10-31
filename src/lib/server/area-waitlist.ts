/**
 * Parent-facing area waitlist actions.
 * The match job lives in area-waitlist-job.ts so this file can be imported
 * from parent pages without pulling mail or push senders into the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { areaPlaceQuery } from "@/lib/area-waitlist";

export const joinAreaWaitlist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { place?: string; radiusKm?: number; ageGroup?: string; startDate?: string } | undefined) => ({
    place: areaPlaceQuery(input?.place),
    radiusKm: Math.min(50, Math.max(1, Math.round(Number(input?.radiusKm) || 10))),
    ageGroup: String(input?.ageGroup || "any").trim().toLowerCase(),
    startDate: input?.startDate,
  }))
  .handler(async ({ context, data }) => {
    const { joinAreaWaitlistForUser } = await import("./area-waitlist-job");
    const result = await joinAreaWaitlistForUser(context.userId, data);
    const { captureServerProductEvent } = await import("@/lib/server/product-events");
    void captureServerProductEvent("waitlist_joined", { source: "area", role: "parent" }, context.userId);
    return result;
  });

export const removeAreaWaitlist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string } | undefined) => ({
    id: String(input?.id || "").trim().slice(0, 80),
  }))
  .handler(async ({ context, data }) => {
    const { removeAreaWaitlistForUser } = await import("./area-waitlist-job");
    return removeAreaWaitlistForUser(context.userId, data.id);
  });

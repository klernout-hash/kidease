import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireAdmin } from "@/lib/server/roles";
import { requestSearchOrigin } from "@/lib/server/request-origin.server";

/**
 * Operator-only. Returns a city label or "Canada". Never a precise pin.
 */
export const checkOperatorLocation = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const origin = requestSearchOrigin();
    const label = origin.source === "default" || !origin.label.trim() ? "Canada" : origin.label;
    return { label, source: origin.source === "ip" ? "ip" : "canada" } as const;
  });

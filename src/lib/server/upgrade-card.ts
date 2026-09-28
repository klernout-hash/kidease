import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

/** Durable per user. A failed read hides nothing extra; the card stays until they dismiss it. */
export const dismissUpgradeCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`
      update profiles
      set upgrade_card_dismissed_at = now()
      where user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

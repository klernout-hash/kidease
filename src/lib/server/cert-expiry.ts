import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { certExpiryDue } from "@/lib/cert-expiry";

/** Upcoming staff certificates for centres this person manages. Nothing is sent. */
export const listCertExpiry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ staff_name: string; centre: string; expires_on: string }>`
      select c.staff_name, d.name as centre, c.expires_on::text as expires_on
      from ece_certificates c
      join daycares d on d.id = c.daycare_id
      join provider_daycares p on p.daycare_id = d.id and p.user_id = ${context.userId}
      where c.expires_on >= current_date
        and c.expires_on <= current_date + 60
      order by c.expires_on
      limit 20
    `.catch(() => [] as Array<{ staff_name: string; centre: string; expires_on: string }>);
    const now = new Date();
    return {
      sent: false as const,
      rows: rows
        .filter((row) => certExpiryDue(String(row.expires_on), now))
        .map((row) => ({
          staffName: row.staff_name,
          centre: row.centre,
          expiresOn: String(row.expires_on).slice(0, 10),
        })),
    };
  });

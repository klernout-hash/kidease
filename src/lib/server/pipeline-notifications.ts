/**
 * Bell items for the pipeline: spot offers, in-app agreements, and withdrawal notices.
 * Projected from the rows themselves (no new table), like leads and claims.
 */
import type { getSql } from "@/lib/db";
import {
  notificationSourceKey,
  type NotificationTitleKey,
  type ProjectedNotification,
} from "@/lib/notifications";
import { ECE_CERT_LINK_FEATURE, certAlert } from "@/lib/staff-certs";

type Sql = Awaited<ReturnType<typeof getSql>>;

const OWNED = `
  exists (select 1 from provider_daycares p where p.user_id = $1 and p.daycare_id = %COL%)
  or exists (select 1 from centre_members m where m.user_id = $1 and m.daycare_id = %COL% and m.status = 'active')
`;

function owned(col: string) {
  return OWNED.replaceAll("%COL%", col);
}

function item(
  titleKey: NotificationTitleKey,
  id: string,
  extra: string,
  href: string,
  createdAt: unknown,
  name: string | null,
  status: string,
): ProjectedNotification {
  const at = createdAt instanceof Date ? createdAt.toISOString() : String(createdAt || "");
  return {
    kind: "pipeline",
    titleKey,
    href,
    sourceKey: notificationSourceKey("pipeline", id, extra),
    createdAt: at,
    daycareName: name,
    status,
  };
}

export async function projectFromPipeline(
  sql: Sql,
  userId: string,
): Promise<ProjectedNotification[]> {
  const out: ProjectedNotification[] = [];

  const mine = await sql
    .query<{
      id: string;
      status: string;
      offered_at: unknown;
      responded_at: unknown;
      name: string;
    }>(
      `select o.id, o.status, o.offered_at, o.responded_at, d.name
         from spot_offers o join daycares d on d.id = o.daycare_id
        where o.user_id = $1
        order by o.offered_at desc limit 20`,
      [userId],
    )
    .catch(() => []);
  for (const row of mine) {
    if (row.status === "open")
      out.push(
        item(
          "notifSpotOffer",
          row.id,
          "open",
          "/parent/spot-offers",
          row.offered_at,
          row.name,
          row.status,
        ),
      );
    else if (row.status === "expired") {
      out.push(
        item(
          "notifSpotOfferEnded",
          row.id,
          "expired",
          "/parent/spot-offers",
          row.responded_at || row.offered_at,
          row.name,
          row.status,
        ),
      );
    }
  }

  const answered = await sql
    .query<{
      id: string;
      status: string;
      responded_at: unknown;
      offered_at: unknown;
      name: string;
    }>(
      `select o.id, o.status, o.responded_at, o.offered_at, d.name
         from spot_offers o join daycares d on d.id = o.daycare_id
        where o.status in ('accepted', 'declined', 'expired') and (${owned("o.daycare_id")})
        order by coalesce(o.responded_at, o.offered_at) desc limit 20`,
      [userId],
    )
    .catch(() => []);
  for (const row of answered) {
    out.push(
      item(
        "notifSpotOfferAnswered",
        row.id,
        `centre:${row.status}`,
        "/provider?desk=listings",
        row.responded_at || row.offered_at,
        row.name,
        row.status,
      ),
    );
  }

  const agreements = await sql
    .query<{
      id: string;
      status: string;
      updated_at: unknown;
      name: string;
      parent_user_id: string;
      envelope_id: string | null;
    }>(
      `select a.id, a.status, a.updated_at, d.name, a.parent_user_id, c.envelope_id
         from parent_enrolment_agreements a
         join daycares d on d.id = a.daycare_id
         join daycare_contracts c on c.id = a.contract_id
        where a.status in ('sent', 'parent_signed', 'completed')
          and (a.parent_user_id = $1 or ${owned("a.daycare_id")})
        order by a.updated_at desc limit 20`,
      [userId],
    )
    .catch(() => []);
  for (const row of agreements) {
    if (row.envelope_id) continue;
    const parent = row.parent_user_id === userId;
    if (parent && row.status === "sent")
      out.push(
        item("notifAgreementSent", row.id, "sent", "/parent", row.updated_at, row.name, row.status),
      );
    else if (parent && row.status === "completed") {
      out.push(
        item(
          "notifAgreementDone",
          row.id,
          "completed",
          "/parent",
          row.updated_at,
          row.name,
          row.status,
        ),
      );
    } else if (!parent && row.status === "parent_signed") {
      out.push(
        item(
          "notifAgreementSigned",
          row.id,
          "parent_signed",
          "/provider?desk=requests",
          row.updated_at,
          row.name,
          row.status,
        ),
      );
    }
  }

  const notices = await sql
    .query<{ id: string; created_at: unknown; name: string }>(
      `select w.id, w.created_at, d.name
         from withdrawals w join daycares d on d.id = w.daycare_id
        where ${owned("w.daycare_id")}
        order by w.created_at desc limit 20`,
      [userId],
    )
    .catch(() => []);
  for (const row of notices) {
    out.push(
      item(
        "notifWithdrawal",
        row.id,
        "notice",
        "/provider/withdrawal",
        row.created_at,
        row.name,
        "notice",
      ),
    );
  }

  // ECE certificate expiry: owners and managers see their centres; staff see their own.
  const certs = await sql
    .query<{ id: string; expires_on: string; staff_name: string; name: string; manage: boolean; mine: boolean }>(
      `select c.id, c.expires_on::text as expires_on, c.staff_name, d.name,
              (exists (select 1 from provider_daycares p where p.user_id = $1 and p.daycare_id = c.daycare_id)
                or exists (select 1 from centre_members m where m.user_id = $1 and m.daycare_id = c.daycare_id
                             and m.status = 'active' and m.role in ('owner', 'manager'))) as manage,
              exists (select 1 from wiring_notices w where w.feature = $2 and w.mode = c.id and w.user_id = $1) as mine
         from ece_certificates c join daycares d on d.id = c.daycare_id
        where c.expires_on <= current_date + 60
          and c.expires_on >= current_date - 60
          and (exists (select 1 from provider_daycares p where p.user_id = $1 and p.daycare_id = c.daycare_id)
               or exists (select 1 from centre_members m where m.user_id = $1 and m.daycare_id = c.daycare_id
                            and m.status = 'active' and m.role in ('owner', 'manager'))
               or exists (select 1 from wiring_notices w where w.feature = $2 and w.mode = c.id and w.user_id = $1))
        order by c.expires_on asc limit 30`,
      [userId, ECE_CERT_LINK_FEATURE],
    )
    .catch(() => []);
  const now = new Date();
  for (const row of certs) {
    const alert = certAlert(row.expires_on, now);
    if (!alert) continue;
    out.push(
      item(
        alert.status === "expired" ? "notifCertExpired" : "notifCertExpiring",
        row.id,
        `${alert.status}:${String(row.expires_on).slice(0, 10)}`,
        "/provider?desk=today",
        alert.at,
        row.mine && !row.manage ? row.name : `${row.staff_name} · ${row.name}`,
        alert.status,
      ),
    );
  }

  return out;
}

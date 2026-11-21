import { createServerFn } from "@tanstack/react-start";
import {
  ACCOUNT_EXPORT_HOURLY_MAX,
  buildAccountExport,
  hourlyAllowance,
  type ExportChild,
  type ExportConsent,
  type ExportEnrolment,
  type ExportInvoice,
  type ExportMessage,
  type ExportPrivacyRequest,
  type ExportProfile,
} from "@/lib/account-export";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

function text(value: unknown): string | null {
  if (value == null) return null;
  const out = value instanceof Date ? value.toISOString() : String(value);
  const trimmed = out.trim();
  return trimmed ? trimmed : null;
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function countOf(rows: { n: unknown }[]): number {
  return num(rows[0]?.n) ?? 0;
}

export const exportMyData = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const sql = await getSql();
    let recent = 0;
    try {
      const rows = await sql<{ n: number }>`
        select count(*)::int as n
        from security_events
        where kind = 'account_export'
          and actor_user_id = ${userId}
          and at > now() - interval '1 hour'
      `;
      recent = countOf(rows);
    } catch {
      return { ok: false as const, error: "unavailable" as const };
    }
    if (!hourlyAllowance(recent, ACCOUNT_EXPORT_HOURLY_MAX).ok) {
      return { ok: false as const, error: "rate" as const };
    }

    try {
      const users = await sql<{
        name: string;
        email: string;
        emailVerified: boolean;
        createdAt: string | Date;
      }>`
        select "name", "email", "emailVerified", "createdAt"
        from "user"
        where "id" = ${userId}
        limit 1
      `;
      const user = users[0];
      if (!user) return { ok: false as const, error: "unavailable" as const };

      const profiles = await sql<{
        role: string | null;
        locale: string | null;
        phone: string | null;
        city: string | null;
        display_name: string | null;
        bio: string | null;
        time_zone: string | null;
        home_label: string | null;
        work_label: string | null;
        home_lat: number | null;
        home_lng: number | null;
        work_lat: number | null;
        work_lng: number | null;
        created_at: string | Date | null;
      }>`
        select role, locale, phone, city, display_name, bio, time_zone,
               home_label, work_label, home_lat, home_lng, work_lat, work_lng, created_at
        from profiles
        where user_id = ${userId}
        limit 1
      `;
      const profileRow = profiles[0];
      const profile: ExportProfile = {
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified === true,
        role: text(profileRow?.role),
        locale: text(profileRow?.locale),
        phone: text(profileRow?.phone),
        city: text(profileRow?.city),
        displayName: text(profileRow?.display_name),
        bio: text(profileRow?.bio),
        timeZone: text(profileRow?.time_zone),
        homeLabel: text(profileRow?.home_label),
        workLabel: text(profileRow?.work_label),
        homeLat: num(profileRow?.home_lat),
        homeLng: num(profileRow?.home_lng),
        workLat: num(profileRow?.work_lat),
        workLng: num(profileRow?.work_lng),
        createdAt: text(profileRow?.created_at) ?? text(user.createdAt),
      };

      const childRows = await sql<{
        user_id: string;
        id: string;
        name: string;
        birthdate: string;
        notes: string | null;
        created_at: string | Date | null;
      }>`
        select user_id, id, name, birthdate, notes, created_at
        from children
        where user_id = ${userId}
        order by created_at asc
      `;
      const children: ExportChild[] = childRows.map((row) => ({
        userId: row.user_id,
        id: row.id,
        name: row.name,
        birthdate: row.birthdate,
        notes: text(row.notes),
        createdAt: text(row.created_at),
      }));

      const bookingRows = await sql<{
        user_id: string;
        id: string;
        daycare_id: string;
        child_id: string | null;
        status: string;
        start_month: string | null;
        start_date: string | null;
        schedule: string | null;
        age_group: string | null;
        monthly_amount: number | null;
        photo_consent_at: string | Date | null;
      }>`
        select user_id, id, daycare_id, child_id, status, start_month, start_date,
               schedule, age_group, monthly_amount, photo_consent_at
        from bookings
        where user_id = ${userId}
        order by created_at asc
      `;
      const agreementRows = await sql<{
        user_id: string;
        id: string;
        daycare_id: string;
        child_id: string | null;
        status: string;
        start_date: string | null;
        child_name: string | null;
        child_birthdate: string | null;
      }>`
        select parent_user_id as user_id, id, daycare_id, child_id, status, start_date,
               child_name, child_birthdate
        from parent_enrolment_agreements
        where parent_user_id = ${userId}
        order by created_at asc
      `;
      const handoffRows = await sql<{
        user_id: string;
        id: string;
        daycare_id: string;
        age_group: string | null;
        step: string;
        fee_cents: number | null;
      }>`
        select parent_user_id as user_id, id, daycare_id, age_group, step, fee_cents
        from enrolment_handoffs
        where parent_user_id = ${userId}
        order by created_at asc
      `;
      const enrolments: ExportEnrolment[] = [
        ...bookingRows.map((row) => ({
          userId: row.user_id,
          id: row.id,
          source: "booking" as const,
          daycareId: row.daycare_id,
          childId: text(row.child_id),
          status: row.status,
          startMonth: text(row.start_month),
          startDate: text(row.start_date),
          schedule: text(row.schedule),
          ageGroup: text(row.age_group),
          childName: null,
          childBirthdate: null,
          feeCents: null,
          monthlyAmount: num(row.monthly_amount),
          photoConsentAt: text(row.photo_consent_at),
        })),
        ...agreementRows.map((row) => ({
          userId: row.user_id,
          id: row.id,
          source: "agreement" as const,
          daycareId: row.daycare_id,
          childId: text(row.child_id),
          status: row.status,
          startMonth: null,
          startDate: text(row.start_date),
          schedule: null,
          ageGroup: null,
          childName: text(row.child_name),
          childBirthdate: text(row.child_birthdate),
          feeCents: null,
          monthlyAmount: null,
          photoConsentAt: null,
        })),
        ...handoffRows.map((row) => ({
          userId: row.user_id,
          id: row.id,
          source: "handoff" as const,
          daycareId: row.daycare_id,
          childId: null,
          status: row.step,
          startMonth: null,
          startDate: null,
          schedule: null,
          ageGroup: text(row.age_group),
          childName: null,
          childBirthdate: null,
          feeCents: num(row.fee_cents),
          monthlyAmount: null,
          photoConsentAt: null,
        })),
      ];

      const centreMessages = await sql<{
        user_id: string;
        id: string;
        conversation_id: string;
        daycare_id: string;
        body: string;
        created_at: string | Date | null;
      }>`
        select c.user_id, m.id, m.conversation_id, c.daycare_id, m.body, m.created_at
        from messages m
        join conversations c on c.id = m.conversation_id
        where c.user_id = ${userId} and m.sender = 'parent'
        order by m.created_at asc
      `;
      const supportMessages = await sql<{
        user_id: string;
        id: string;
        body: string;
        created_at: string | Date | null;
      }>`
        select st.user_id, sm.id, sm.body, sm.created_at
        from support_messages sm
        join support_threads st on st.id = sm.thread_id
        where st.user_id = ${userId} and sm.sender = 'user'
        order by sm.created_at asc
      `;
      const messages: ExportMessage[] = [
        ...centreMessages.map((row) => ({
          userId: row.user_id,
          id: row.id,
          channel: "centre" as const,
          conversationId: row.conversation_id,
          daycareId: row.daycare_id,
          body: row.body,
          createdAt: text(row.created_at),
        })),
        ...supportMessages.map((row) => ({
          userId: row.user_id,
          id: row.id,
          channel: "support" as const,
          conversationId: null,
          daycareId: null,
          body: row.body,
          createdAt: text(row.created_at),
        })),
      ];

      const billRows = await sql<{
        user_id: string;
        id: string;
        number: string | null;
        daycare_id: string;
        period: string | null;
        status: string;
        currency: string;
        total: number | null;
        paid_at: string | Date | null;
      }>`
        select parent_user_id as user_id, id, number, daycare_id, period, status, currency, total, paid_at
        from invoices
        where parent_user_id = ${userId}
        order by created_at asc
      `;
      const stripeRows = await sql<{
        user_id: string | null;
        id: string;
        number: string | null;
        daycare_id: string | null;
        status: string;
        currency: string;
        amount_cents: number | null;
        paid_at: string | Date | null;
      }>`
        select parent_user_id as user_id, stripe_invoice_id as id, number, daycare_id,
               status, currency, amount_cents, paid_at
        from stripe_parent_invoices
        where parent_user_id = ${userId}
        order by created_at asc
      `;
      const invoices: ExportInvoice[] = [
        ...billRows.map((row) => ({
          userId: row.user_id,
          id: row.id,
          source: "kidease" as const,
          number: text(row.number),
          daycareId: row.daycare_id,
          period: text(row.period),
          status: row.status,
          currency: row.currency,
          total: num(row.total),
          paidAt: text(row.paid_at),
        })),
        ...stripeRows.flatMap((row) => {
          if (!row.user_id) return [];
          return [{
            userId: row.user_id,
            id: row.id,
            source: "stripe" as const,
            number: text(row.number),
            daycareId: text(row.daycare_id),
            period: null,
            status: row.status,
            currency: row.currency,
            total: num(row.amount_cents),
            paidAt: text(row.paid_at),
          }];
        }),
      ];

      const consentRows = await sql<{
        user_id: string;
        channel: string;
        purpose: string;
        granted: number;
        granted_at: string | Date | null;
        withdrawn_at: string | Date | null;
        method: string | null;
        locale: string | null;
      }>`
        select user_id, channel, purpose, granted, granted_at, withdrawn_at, method, locale
        from casl_consents
        where user_id = ${userId}
        order by channel, purpose
      `;
      const consents: ExportConsent[] = [
        ...consentRows.map((row) => ({
          userId: row.user_id,
          channel: row.channel,
          purpose: row.purpose,
          granted: Number(row.granted) === 1,
          grantedAt: text(row.granted_at),
          withdrawnAt: text(row.withdrawn_at),
          method: text(row.method),
          locale: text(row.locale),
        })),
        ...bookingRows.flatMap((row) => {
          const at = text(row.photo_consent_at);
          if (!at) return [];
          return [{
            userId: row.user_id,
            channel: "photo",
            purpose: "child_photo",
            granted: true,
            grantedAt: at,
            withdrawnAt: null,
            method: "booking",
            locale: null,
          }];
        }),
      ];

      const requestRows = await sql<{
        user_id: string | null;
        id: string;
        kind: string;
        note: string;
        created_at: string | Date | null;
      }>`
        select user_id, id, kind, note, created_at
        from privacy_requests
        where user_id = ${userId}
        order by created_at asc
      `;
      const privacyRequests: ExportPrivacyRequest[] = requestRows.flatMap((row) => {
        if (!row.user_id) return [];
        return [{
          userId: row.user_id,
          id: row.id,
          kind: row.kind,
          note: row.note,
          createdAt: text(row.created_at),
        }];
      });

      const built = buildAccountExport({
        exportedAt: new Date().toISOString(),
        userId,
        profile,
        children,
        enrolments,
        messages,
        invoices,
        consents,
        privacyRequests,
      });
      await sql`
        insert into security_events (id, kind, actor_user_id, meta)
        values (${crypto.randomUUID().replace(/-/g, "")}, 'account_export', ${userId}, '{}'::jsonb)
      `.catch(() => undefined);
      return {
        ok: true as const,
        filename: "kidease-account.json",
        json: JSON.stringify(built.document, null, 2),
        csv: built.csv,
      };
    } catch {
      return { ok: false as const, error: "unavailable" as const };
    }
  });

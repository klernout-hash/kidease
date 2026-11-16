/**
 * Read-only admin view of saved Connect accounts, payouts, and charges.
 * Does not call Stripe and does not move money.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

export type AdminConnectAccount = {
  daycareId: string;
  daycareName: string | null;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  updatedAt: string | null;
};

export type AdminPayoutRow = {
  id: string;
  daycareName: string | null;
  period: string;
  status: string;
  gross: number;
  net: number;
  paidAt: string | null;
};

export type AdminChargeRow = {
  id: string;
  daycareName: string | null;
  amount: number;
  status: string;
  method: string | null;
  reference: string | null;
  createdAt: string | null;
};

export type AdminPayoutsPage = {
  accounts: AdminConnectAccount[];
  payouts: AdminPayoutRow[];
  charges: AdminChargeRow[];
  accountsError: string | null;
  payoutsError: string | null;
  chargesError: string | null;
};

function on(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1;
}

export const loadAdminPayouts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminPayoutsPage> => {
    const { requireAdmin } = await import("@/lib/server/roles");
    await requireAdmin(context.userId);
    const sql = await getSql();
    const page: AdminPayoutsPage = {
      accounts: [],
      payouts: [],
      charges: [],
      accountsError: null,
      payoutsError: null,
      chargesError: null,
    };
    try {
      const rows = await sql.query<{
        daycare_id: string;
        daycare_name: string | null;
        stripe_account_id: string | null;
        charges_enabled: number | boolean | null;
        payouts_enabled: number | boolean | null;
        details_submitted: number | boolean | null;
        updated_at: string | null;
      }>(
        `select s.daycare_id, d.name as daycare_name, s.stripe_account_id,
                s.charges_enabled, s.payouts_enabled, s.details_submitted, s.updated_at
         from stripe_accounts s
         left join daycares d on d.id = s.daycare_id
         order by s.updated_at desc
         limit 80`,
      );
      page.accounts = rows.map((row) => ({
        daycareId: row.daycare_id,
        daycareName: row.daycare_name,
        accountId: row.stripe_account_id,
        chargesEnabled: on(row.charges_enabled),
        payoutsEnabled: on(row.payouts_enabled),
        detailsSubmitted: on(row.details_submitted),
        updatedAt: row.updated_at ? String(row.updated_at) : null,
      }));
    } catch (err) {
      console.error("[kidease-admin-payouts] accounts", err instanceof Error ? err.message : "failed");
      page.accountsError = "Could not read Connect accounts.";
    }
    try {
      const rows = await sql.query<{
        id: string;
        daycare_name: string | null;
        period: string;
        status: string;
        gross: number;
        net: number;
        paid_at: string | null;
      }>(
        `select p.id, d.name as daycare_name, p.period, p.status, p.gross, p.net, p.paid_at
         from payouts p
         left join daycares d on d.id = p.daycare_id
         order by p.created_at desc
         limit 40`,
      );
      page.payouts = rows.map((row) => ({
        id: row.id,
        daycareName: row.daycare_name,
        period: row.period,
        status: row.status,
        gross: Number(row.gross) || 0,
        net: Number(row.net) || 0,
        paidAt: row.paid_at ? String(row.paid_at) : null,
      }));
    } catch (err) {
      console.error("[kidease-admin-payouts] payouts", err instanceof Error ? err.message : "failed");
      page.payoutsError = "Could not read payouts.";
    }
    try {
      const rows = await sql.query<{
        id: string;
        daycare_name: string | null;
        amount: number;
        status: string;
        method: string | null;
        reference: string | null;
        created_at: string | null;
      }>(
        `select p.id, d.name as daycare_name, p.amount, p.status, p.method, p.reference, p.created_at
         from payments p
         left join daycares d on d.id = p.daycare_id
         order by p.created_at desc
         limit 40`,
      );
      page.charges = rows.map((row) => ({
        id: row.id,
        daycareName: row.daycare_name,
        amount: Number(row.amount) || 0,
        status: row.status,
        method: row.method,
        reference: row.reference,
        createdAt: row.created_at ? String(row.created_at) : null,
      }));
    } catch (err) {
      console.error("[kidease-admin-payouts] charges", err instanceof Error ? err.message : "failed");
      page.chargesError = "Could not read charges.";
    }
    return page;
  });

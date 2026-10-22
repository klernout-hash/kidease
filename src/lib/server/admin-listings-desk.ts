/**
 * Admin listings-data tabs. The browser calls these server functions.
 * A database failure becomes an empty report. The error text stays on the server.
 */
import { createServerFn } from "@tanstack/react-start";
import { AI_FLAGS } from "@/lib/ai/flags";
import { demandMapCells } from "@/lib/admin-tools";
import { authMiddleware } from "@/lib/auth/middleware";
import { aiFeatureOn } from "@/lib/server/ai-feature";
import { listProvincialVacancyReport } from "@/lib/server/provincial-vacancy";
import { listRankingMarket } from "@/lib/server/ranking-market";
import { requireAdmin } from "@/lib/server/roles";
import { listUnconfirmedVacancies, type UnconfirmedVacancyList } from "@/lib/server/vacancy-stale";

const EMPTY_VACANCY = {
  runs: [] as Awaited<ReturnType<typeof listProvincialVacancyReport>>["runs"],
  matched: [] as Awaited<ReturnType<typeof listProvincialVacancyReport>>["matched"],
  unmatched: [] as Awaited<ReturnType<typeof listProvincialVacancyReport>>["unmatched"],
  changed: [] as Awaited<ReturnType<typeof listProvincialVacancyReport>>["changed"],
  note: "",
};

const EMPTY_UNCONFIRMED: UnconfirmedVacancyList = { staleDays: 30, total: 0, rows: [] };

export const loadProvincialOpeningsDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    try {
      await requireAdmin(context.userId);
      const report = await listProvincialVacancyReport();
      const unconfirmed = await listUnconfirmedVacancies();
      return { ok: true as const, report, unconfirmed };
    } catch {
      console.error("[admin-vacancies] report unavailable");
      return { ok: false as const, report: EMPTY_VACANCY, unconfirmed: EMPTY_UNCONFIRMED };
    }
  });

export const loadRankingMarketDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    try {
      await requireAdmin(context.userId);
      const rows = await listRankingMarket();
      let cells: ReturnType<typeof demandMapCells> | null = null;
      try {
        const on = await aiFeatureOn(AI_FLAGS.demandMap, "kidease-admin");
        cells = on ? demandMapCells(rows) : null;
      } catch {
        cells = null;
      }
      return { ok: true as const, rows, cells };
    } catch {
      console.error("[admin-ranking] report unavailable");
      return { ok: false as const, rows: [] as Awaited<ReturnType<typeof listRankingMarket>>, cells: null };
    }
  });

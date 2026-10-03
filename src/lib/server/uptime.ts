import { dbSource, getSqlWithin } from "@/lib/db";
import { reportError } from "@/lib/observe";
import {
  buildHealthPayload,
  pingBetterStackHeartbeat,
  type HealthCheckState,
  type HealthPayload,
} from "@/lib/uptime";

export { pingBetterStackHeartbeat } from "@/lib/uptime";

let lastCfrFinger = "";

const DATABASE_PROBE_MS = 2500;

/**
 * Shallow DB ping. Preview/Vercel without a database URL reports `skipped`
 * so catalogue-only hosts stay green. Never returns connection strings.
 */
export async function probeDatabase(): Promise<HealthCheckState> {
  if (dbSource === "none") return "skipped";
  try {
    const sql = await getSqlWithin(DATABASE_PROBE_MS);
    const rows = await sql<{ ok: number | string }>`select 1 as ok`;
    return Number(rows[0]?.ok) === 1 ? "ok" : "error";
  } catch {
    return "error";
  }
}

export async function collectHealth(): Promise<HealthPayload> {
  const database = await probeDatabase();
  const payload = buildHealthPayload({
    app: "ok",
    database,
  });
  if (database === "ok") {
    try {
      const sql = await getSqlWithin(DATABASE_PROBE_MS);
      const rows = await sql<{ n: number | string }>`
        select count(*)::int as n from daycares where coalesce(ages_confirmed, 0) = 1
      `;
      const count = Number(rows[0]?.n);
      if (Number.isFinite(count)) payload.agesConfirmed = count;
      const { advanceRuntimeSourcedAges, probeRuntimeAgeListings } = await import(
        "@/lib/server/sourced-ages-runtime"
      );
      const query = (text: string, params?: unknown[]) =>
        sql.query(text, params).then((queried) => ({ rows: queried }));
      const fill = await advanceRuntimeSourcedAges(query);
      if (!fill.done || fill.cursor > 0) {
        payload.ageFill = fill;
        payload.ageProbe = await probeRuntimeAgeListings(query);
      }
    } catch (err) {
      // The count is optional. A missing column must not fail the liveness probe.
      const message = err instanceof Error ? err.message : "";
      if (message.startsWith("sourced ages file")) payload.ageFillError = "short-file";
      else if (!payload.ageFill) payload.ageFillError = "unavailable";
    }
  }
  if (payload.cfr.candidate) {
    const finger = `${payload.revision ?? ""}:${payload.checks.app}:${payload.checks.database}`;
    if (lastCfrFinger !== finger) {
      lastCfrFinger = finger;
      reportError(new Error("production_change_failure"), {
        route: "/api/health",
        extra: { alert: "cfr_candidate", database: payload.checks.database },
      });
    }
  } else {
    void pingBetterStackHeartbeat();
  }
  return payload;
}


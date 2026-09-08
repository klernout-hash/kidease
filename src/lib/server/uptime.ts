import { dbSource, getSqlWithin } from "@/lib/db";
import { buildHealthPayload, type HealthCheckState, type HealthPayload } from "@/lib/uptime";

export { pingBetterStackHeartbeat } from "@/lib/uptime";

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
  return buildHealthPayload({
    app: "ok",
    database: await probeDatabase(),
  });
}


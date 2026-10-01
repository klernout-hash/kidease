import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";

export type TelemetryKind = "locate" | "search" | "view" | "heartbeat";

export type TelemetryHit = {
  kind: TelemetryKind;
  geohash: string;
  city?: string;
  province?: string;
  radiusKm?: number;
  slug?: string;
  sessionId?: string;
};

export const ingestTelemetry = createServerFn({ method: "POST" })
  .validator((input: { hits: TelemetryHit[] }) => input)
  .handler(async ({ data }) => {
    const hits = data.hits.filter((h) => h.geohash && h.geohash.length <= 5).slice(0, 40);
    if (!hits.length) return { ok: true, n: 0 };
    const sql = await getSql();
    if (import.meta.env.SSR) {
      const { ensureLocationTelemetry } = await import("./runtime-schema");
      await ensureLocationTelemetry(sql);
    }
    await sql.query(`delete from location_telemetry where created_at < now() - interval '7 days'`).catch(() => null);
    for (const hit of hits) {
      await sql.query(
        `insert into location_telemetry (id, kind, geohash, city, province, radius_km, slug, session_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          nid(),
          hit.kind,
          hit.geohash.slice(0, 5),
          hit.city ?? null,
          hit.province ?? null,
          hit.radiusKm ?? null,
          hit.slug ?? null,
          hit.sessionId ?? null,
        ],
      );
    }
    return { ok: true, n: hits.length };
  });

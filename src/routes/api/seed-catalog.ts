import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { dbSource, getSql } from "@/lib/db";
import { loadJsonCatalogFromDisk } from "@/lib/catalog-hydrate";
import { catalogRowsForSeed, clampSeedLimit, clampSeedOffset, seedCatalogChunk } from "@/lib/catalog-seed";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

function authorized(request: Request) {
  return cronAuthorized(request);
}

async function readOffset(request: Request) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("offset");
  if (fromQuery != null && fromQuery !== "") return Number(fromQuery);
  if (request.method === "GET") return 0;
  try {
    const body = (await request.clone().json()) as { offset?: number; limit?: number };
    return Number(body?.offset ?? 0);
  } catch {
    return 0;
  }
}

async function readLimit(request: Request) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("limit");
  if (fromQuery != null && fromQuery !== "") return clampSeedLimit(Number(fromQuery), 200, 250);
  if (request.method === "GET") return 200;
  try {
    const body = (await request.clone().json()) as { limit?: number };
    return clampSeedLimit(Number(body?.limit ?? 200), 200, 250);
  } catch {
    return 200;
  }
}

async function run(request: Request) {
  const ip = requestIp(request);
  if (!authorized(request)) {
    await logSecurityEvent({ kind: "seed_catalog_denied", ip, detail: "missing or invalid cron secret" });
    return new Response("Unauthorized", { status: 401 });
  }
  if (dbSource !== "neon") {
    return Response.json({ ok: false, error: "DATABASE_URL is required" }, { status: 503 });
  }

  const sql = await getSql();
  const rows = catalogRowsForSeed(await loadJsonCatalogFromDisk());
  const offset = clampSeedOffset(await readOffset(request), rows.length);
  const limit = await readLimit(request);
  const result = await seedCatalogChunk(sql, rows, { offset, limit, concurrency: 16 });
  await logSecurityEvent({
    kind: "seed_catalog_run",
    ip,
    detail: `offset=${result.offset} next=${result.nextOffset} upserted=${result.upserted} done=${result.done}`,
  });
  return Response.json({
    ok: true,
    ...result,
    source: "centres.json",
  });
}

export const Route = createFileRoute("/api/seed-catalog")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});

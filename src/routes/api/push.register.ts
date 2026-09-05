import { createFileRoute } from "@tanstack/react-router";

function fail(err: unknown, fallback = "Request failed") {
  const message = err instanceof Error ? err.message : fallback;
  const status =
    err &&
    typeof err === "object" &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : message === "Unauthorized" || message === "Not authorized"
        ? 401
        : 400;
  return Response.json({ ok: false, error: message }, { status });
}

async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Auth-required device token register. FEATURE_PUSH must be on to persist.
 * Native iOS / Android only — web tokens are rejected. Never sends.
 */
async function run(request: Request) {
  const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
  const { requireUserId } = await import("@/lib/auth/verify.server");
  const { getSql } = await import("@/lib/db");
  const { upsertPushDeviceToken } = await import("@/lib/server/push-tokens");

  try {
    assertSameSiteRequest();
    const userId = await requireUserId();
    const body = await readJson(request);
    const sql = await getSql();
    const result = await upsertPushDeviceToken(sql, userId, {
      token: String(body.token || ""),
      platform: String(body.platform || ""),
      provider: body.provider != null ? String(body.provider) : undefined,
      deviceId: body.deviceId != null ? String(body.deviceId) : undefined,
      locale: body.locale != null ? String(body.locale) : undefined,
    });
    return Response.json(result, { status: result.ok ? 200 : 403 });
  } catch (err) {
    return fail(err);
  }
}

export const Route = createFileRoute("/api/push/register")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405 }),
      POST: ({ request }) => run(request),
    },
  },
});

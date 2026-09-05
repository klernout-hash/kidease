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
 * Admin-only dry-run. Counts stored tokens. Never sends.
 * Same gate as other `/api/admin/*` (session + profiles.role = admin + same-site).
 */
async function requireAdminCaller() {
  const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
  const { requireUserId } = await import("@/lib/auth/verify.server");
  const { requireAdmin } = await import("@/lib/server/roles");
  assertSameSiteRequest();
  const userId = await requireUserId();
  await requireAdmin(userId);
  return userId;
}

async function run(request: Request) {
  try {
    await requireAdminCaller();
  } catch (err) {
    return fail(err);
  }

  const body = request.method === "POST" ? await readJson(request) : {};
  const url = new URL(request.url);
  const userId = String(body.userId || url.searchParams.get("userId") || "").trim();
  const { getSql } = await import("@/lib/db");
  const { dryRunPushNotification } = await import("@/lib/server/push-tokens");
  const sql = await getSql();
  const result = await dryRunPushNotification(
    {
      userId: userId || undefined,
      title: body.title != null ? String(body.title) : undefined,
      body: body.body != null ? String(body.body) : undefined,
    },
    { sql },
  );
  return Response.json(result);
}

export const Route = createFileRoute("/api/admin/push-dry-run")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});

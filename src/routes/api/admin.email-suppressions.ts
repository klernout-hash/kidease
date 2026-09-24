import { createFileRoute } from "@tanstack/react-router";
import { BOUNCE_RATE_WARN_PCT, COMPLAINT_RATE_WARN_PCT } from "@/lib/email-suppressions";

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

/** Same gate as other `/api/admin/*` (session + kyle@ + same-site). */
async function requireAdminCaller() {
  const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
  const { requireUserId } = await import("@/lib/auth/verify.server");
  const { requireAdmin } = await import("@/lib/server/roles");
  assertSameSiteRequest();
  const userId = await requireUserId();
  await requireAdmin(userId);
  return userId;
}

/**
 * Admin denylist + campaign health.
 * GET without view returns the suppression emails (JSON, or text/plain with format=text).
 * GET ?view=stats&days=7|30 returns delivered / bounced / complained rates.
 */
async function run(request: Request) {
  try {
    await requireAdminCaller();
  } catch (err) {
    return fail(err);
  }

  const url = new URL(request.url);
  const { listEmailSuppressions, loadEmailHealth } = await import("@/lib/server/email-suppressions");

  if (url.searchParams.get("view") === "stats") {
    try {
      const health = await loadEmailHealth(url.searchParams.get("days"));
      return Response.json({
        ok: true,
        ...health,
        thresholds: { bouncePct: BOUNCE_RATE_WARN_PCT, complaintPct: COMPLAINT_RATE_WARN_PCT },
      });
    } catch (err) {
      return fail(err, "Could not load email health");
    }
  }

  try {
    const emails = await listEmailSuppressions();
    if (url.searchParams.get("format") === "text") {
      return new Response(emails.length ? `${emails.join("\n")}\n` : "", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return Response.json({ ok: true, emails });
  } catch (err) {
    return fail(err, "Could not load suppressions");
  }
}

export const Route = createFileRoute("/api/admin/email-suppressions")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: () => new Response("Method Not Allowed", { status: 405 }),
    },
  },
});

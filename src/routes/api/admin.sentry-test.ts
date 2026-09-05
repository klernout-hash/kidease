import { createFileRoute } from "@tanstack/react-router";
import { SENTRY_TEST_MESSAGE } from "@/lib/sentry-shared";

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

/**
 * Admin-only harmless Sentry probe. Session + profiles.role = 'admin',
 * same-site, and `/api/admin/*` is already redirected off `*.vercel.app`.
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

export const Route = createFileRoute("/api/admin/sentry-test")({
  server: {
    handlers: {
      GET: async () => {
        try {
          await requireAdminCaller();
        } catch (err) {
          return fail(err);
        }

        const { Sentry, flushSentry, initSentryServer, sentryServerEnabled } =
          await import("@/lib/sentry.server");
        initSentryServer();
        Sentry.captureException(new Error(SENTRY_TEST_MESSAGE));
        await flushSentry();
        return Response.json({ ok: true, enabled: sentryServerEnabled() });
      },
    },
  },
});

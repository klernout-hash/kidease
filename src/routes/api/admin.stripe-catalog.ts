import { createFileRoute } from "@tanstack/react-router";
import { bootstrapStripeCatalog } from "@/lib/server/stripe-bootstrap";

function fail(err: unknown, fallback = "Request failed") {
  const message = err instanceof Error ? err.message : fallback;
  const status =
    message === "Unauthorized" || message === "Not authorized"
      ? 401
      : 400;
  return Response.json({ ok: false, error: message }, { status });
}

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
 * Admin-only Stripe catalog status / LIVE bootstrap.
 * Never returns secret key values — only price IDs and a redacted secret label.
 */
export const Route = createFileRoute("/api/admin/stripe-catalog")({
  server: {
    handlers: {
      GET: async () => {
        try {
          await requireAdminCaller();
          const data = await bootstrapStripeCatalog({ createMissing: false });
          return Response.json(data);
        } catch (err) {
          return fail(err);
        }
      },
      POST: async () => {
        try {
          await requireAdminCaller();
          const data = await bootstrapStripeCatalog({ createMissing: true });
          return Response.json(data);
        } catch (err) {
          return fail(err);
        }
      },
    },
  },
});

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { VerifiedAuthSession } from "@/lib/auth/verify.server";
import { SQL_SETTLE_MS, withTimeout } from "@/lib/timeout";

export type AdminQueueBootstrapCounts =
  | { status: "ready"; waiting: number; approved: number; declined: number; all: number }
  | { status: "unavailable" };

/** Counts only. This is display data, never an authorization credential. */
export type AdminQueueBootstrap = {
  viewerId: string;
  sessionId: string;
  checkedAt: number;
  expiresAt: number;
  counts: AdminQueueBootstrapCounts;
} | null;

function assertSession(
  session: VerifiedAuthSession | null,
  userId: string,
): asserts session is VerifiedAuthSession & { sessionId: string; token: string } {
  if (
    !session ||
    session.id !== userId ||
    !session.sessionId ||
    !session.token ||
    !Number.isFinite(session.expiresAtMs) ||
    session.expiresAtMs <= Date.now()
  ) {
    throw new Error("Unauthorized");
  }
}

/**
 * Dormant by default. Middleware authenticates even a direct disabled call.
 * The route flag merely avoids requesting this function; it never grants access.
 */
export const loadAdminQueueBootstrap = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminQueueBootstrap> => {
    if (process.env.FEATURE_ADMIN_QUEUE_SSR !== "1") return null;
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    return withTimeout(
      (async () => {
        const { getSessionUser, getVerifiedAuthSession } = await import("@/lib/auth/verify.server");
        const { requireAdmin, resolveSessionDesks } = await import("@/lib/server/roles");
        const { canVisitDesk } = await import("@/lib/desks");
        const { readViewAsPublic } = await import("@/lib/view-as-public");
        const { getCurrentUserTwoFactorExpiryMs } = await import("@/lib/server/two-factor.server");
        const verified = await getVerifiedAuthSession(context.bearerToken);
        assertSession(verified, context.userId);
        if (readViewAsPublic()) throw new Error("Not authorized");
        await requireAdmin(context.userId);
        // Preserve desk/account denial checks without intake sends or account cleanup.
        const desks = await resolveSessionDesks(context.userId, { readOnly: true });
        if (desks.viewAs || !canVisitDesk(desks.desks, "admin", desks.role, desks.email)) {
          throw new Error("Not authorized");
        }

        let counts: AdminQueueBootstrapCounts;
        try {
          // Shared queue predicates, without subscription/payment enrichment.
          const { readAdminCentreQueueRows } = await import("@/lib/server/admin-centre-queue");
          const { staffQueueRows } = await import("@/lib/listing-visibility");
          const { tallyAdminCentreStats } = await import("@/lib/admin-stat-filter");
          const rows = await withTimeout(
            readAdminCentreQueueRows(),
            Math.max(1, Math.floor(SQL_SETTLE_MS / 3)),
            "admin-queue-read-timeout",
          );
          counts = { status: "ready", ...tallyAdminCentreStats(staffQueueRows(rows, false)) };
        } catch {
          counts = { status: "unavailable" };
        }

        // Recheck proofs and the real session after the read. A result that lost
        // authorization in flight must never become serialized route data.
        await requireAdmin(context.userId);
        const currentDesks = await resolveSessionDesks(context.userId, { readOnly: true });
        if (
          currentDesks.viewAs ||
          !canVisitDesk(currentDesks.desks, "admin", currentDesks.role, currentDesks.email)
        ) {
          throw new Error("Not authorized");
        }
        const effective = await getSessionUser(context.bearerToken);
        if (effective?.id !== context.userId || readViewAsPublic())
          throw new Error("Not authorized");
        const confirmed = await getVerifiedAuthSession(context.bearerToken);
        assertSession(confirmed, context.userId);
        if (confirmed.sessionId !== verified.sessionId || confirmed.token !== verified.token) {
          throw new Error("Unauthorized");
        }
        const proofExpiresAt = getCurrentUserTwoFactorExpiryMs(context.userId);
        if (proofExpiresAt === null) throw new Error("Two-factor verification required");
        const checkedAt = Date.now();
        const expiresAt = Math.min(
          checkedAt + 15_000,
          verified.expiresAtMs,
          confirmed.expiresAtMs,
          proofExpiresAt,
        );
        if (expiresAt <= checkedAt) throw new Error("Two-factor verification required");
        return {
          viewerId: context.userId,
          sessionId: confirmed.sessionId,
          checkedAt,
          expiresAt,
          counts,
        };
      })(),
      SQL_SETTLE_MS,
      "admin-bootstrap-timeout",
    );
  });

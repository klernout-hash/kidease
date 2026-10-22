import { createFileRoute } from "@tanstack/react-router";

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : "Request failed";
  const status = message === "Unauthorized" || message === "Not authorized" ? 401 : 400;
  return Response.json({ ok: false, error: message }, { status });
}

async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const Route = createFileRoute("/api/referrals")({
  server: {
    handlers: {
      GET: () => load(),
      POST: ({ request }) => update(request),
    },
  },
});

async function load() {
  const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
  const { requireUserId } = await import("@/lib/auth/verify.server");
  const { ensureReferralCode } = await import("@/lib/server/referrals");
  try {
    assertSameSiteRequest();
    const userId = await requireUserId();
    const summary = await ensureReferralCode(userId);
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    return fail(err);
  }
}

async function update(request: Request) {
  const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
  const { requireUserId } = await import("@/lib/auth/verify.server");
  const { claimReferral, recordReferralOpen } = await import("@/lib/server/referrals");
  try {
    assertSameSiteRequest();
    const body = await readJson(request);
    const code = String(body.code || "");
    if (body.action === "open") {
      const counted = await recordReferralOpen(code);
      return Response.json({ ok: counted }, { status: counted ? 200 : 404 });
    }
    if (body.action === "claim") {
      const userId = await requireUserId();
      const result = await claimReferral(userId, code);
      return Response.json(result, { status: result.ok ? 200 : 400 });
    }
    return Response.json({ ok: false }, { status: 400 });
  } catch (err) {
    return fail(err);
  }
}

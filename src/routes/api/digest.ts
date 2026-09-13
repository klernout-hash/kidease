import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { sendDailyDigest } from "@/lib/server/notify";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

function authorized(request: Request) {
  return cronAuthorized(request);
}

async function run(request: Request) {
  const ip = requestIp(request);
  if (!authorized(request)) {
    await logSecurityEvent({ kind: "digest_denied", ip, detail: "missing or invalid cron secret" });
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sendDailyDigest();
  let verifyEmailNudge: { ok: boolean; sent?: number; skipped?: number; failed?: number; scanned?: number } = {
    ok: false,
  };
  try {
    const { runVerifyEmailNudgeJob } = await import("@/lib/server/signup-user-mail.server");
    verifyEmailNudge = await runVerifyEmailNudgeJob();
  } catch (err) {
    console.error("[kidease-mail] verify-email nudge job failed", err);
  }
  await logSecurityEvent({ kind: "digest_run", ip, detail: "ok" });
  return Response.json({ ...result, verifyEmailNudge });
}

export const Route = createFileRoute("/api/digest")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});

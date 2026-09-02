import { createFileRoute } from "@tanstack/react-router";
import { listAdminContracts, sendCentreContract, voidCentreContract } from "@/lib/server/contracts";

async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function fail(err: unknown, fallback = "Request failed") {
  const message = err instanceof Error ? err.message : fallback;
  const status = message === "Not authorized" ? 401 : 400;
  return Response.json({ ok: false, error: message }, { status });
}

export const Route = createFileRoute("/api/admin/contracts")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const data = await listAdminContracts();
          return Response.json({ ok: true, ...data });
        } catch (err) {
          return fail(err);
        }
      },
      POST: async ({ request }) => {
        const body = await readJson(request);
        const action = String(body.action || "send");
        try {
          if (action === "void") {
            const contractId = String(body.contractId || "");
            if (!contractId) return fail(new Error("contractId is required"));
            const data = await voidCentreContract({ data: { contractId } });
            return Response.json({ ok: true, ...data });
          }
          const daycareId = String(body.daycareId || "");
          if (!daycareId) return fail(new Error("daycareId is required"));
          const data = await sendCentreContract({
            data: {
              daycareId,
              signerName: typeof body.signerName === "string" ? body.signerName : undefined,
              signerEmail: typeof body.signerEmail === "string" ? body.signerEmail : undefined,
            },
          });
          return Response.json({ ok: true, ...data });
        } catch (err) {
          return fail(err);
        }
      },
    },
  },
});

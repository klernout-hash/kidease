import { createFileRoute } from "@tanstack/react-router";
import { parsePackKind } from "@/lib/docusign-packs";
import { listAdminContracts, sendCentreContract, syncCentreContract, voidCentreContract } from "@/lib/server/contracts";

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
            return Response.json({ ...data, ok: true as const });
          }
          if (action === "sync") {
            const contractId = String(body.contractId || "");
            if (!contractId) return fail(new Error("contractId is required"));
            const data = await syncCentreContract({ data: { contractId } });
            return Response.json({ ...data, ok: true as const });
          }
          const daycareId = String(body.daycareId || "");
          if (!daycareId) return fail(new Error("daycareId is required"));
          const data = await sendCentreContract({
            data: {
              daycareId,
              packKind: parsePackKind(body.packKind),
              templateId: typeof body.templateId === "string" ? body.templateId : undefined,
              signerName: typeof body.signerName === "string" ? body.signerName : undefined,
              signerEmail: typeof body.signerEmail === "string" ? body.signerEmail : undefined,
            },
          });
          return Response.json({ ...data, ok: true as const });
        } catch (err) {
          return fail(err);
        }
      },
    },
  },
});

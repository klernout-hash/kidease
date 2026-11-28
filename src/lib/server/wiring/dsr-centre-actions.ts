import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { readViewAsPublic } from "@/lib/view-as-public";
import { dsrPropagationEnabled } from "@/lib/wiring/dsr-propagation";
import {
  assignPendingCentreExport,
  completeOwnedCentreExport,
  listOwnedCentreExports,
} from "@/lib/server/wiring/dsr-centre-task";

const id = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 100) : "";

// Route loaders also run during client navigation; read the private flag on
// the server instead of relying on process.env in the browser.
export const loadDsrCentreDeskFlag = createServerFn({ method: "GET" })
  .handler(() => ({ enabled: dsrPropagationEnabled() }));

export const assignCentreExport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { requestId?: string; centreId?: string; verified?: boolean }) => ({
    requestId: id(input?.requestId),
    centreId: id(input?.centreId),
    verified: input?.verified === true,
  }))
  .handler(async ({ context, data }) => {
    if (!dsrPropagationEnabled() || readViewAsPublic() || !data.requestId || !data.centreId || !data.verified) return { ok: false };
    const { getRequest, setResponseStatus } = await import("@tanstack/react-start/server");
    const { nativeShellHidesAdmin } = await import("@/lib/native-admin");
    const req = getRequest();
    if (nativeShellHidesAdmin({ userAgent: req.headers.get("user-agent"), cookie: req.headers.get("cookie") })) {
      setResponseStatus(403);
      return { ok: false };
    }
    const { requireAdmin } = await import("@/lib/server/roles");
    await requireAdmin(context.userId);
    return {
      ok: await assignPendingCentreExport(await getSql(), {
        requestId: data.requestId,
        centreId: data.centreId,
        actorId: context.userId,
      }),
    };
  });

export const listCentreExports = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!dsrPropagationEnabled() || readViewAsPublic()) return [];
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    return listOwnedCentreExports(await getSql(), context.userId);
  });

export const completeCentreExport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { taskId?: string }) => ({ taskId: id(input?.taskId) }))
  .handler(async ({ context, data }) => {
    if (!dsrPropagationEnabled() || readViewAsPublic() || !data.taskId) return { ok: false };
    const ok = await completeOwnedCentreExport(await getSql(), context.userId, data.taskId);
    if (!ok) {
      const { setResponseStatus } = await import("@tanstack/react-start/server");
      setResponseStatus(403);
    }
    return { ok };
  });

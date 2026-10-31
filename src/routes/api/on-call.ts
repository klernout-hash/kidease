import { createFileRoute } from "@tanstack/react-router";
import { maybeNotifyOnCall } from "@/lib/on-call";

export const Route = createFileRoute("/api/on-call")({
  server: {
    handlers: {
      POST: async () => {
        const checkedAt = new Date().toISOString();
        let ok = true;
        try {
          const { collectHealth } = await import("@/lib/server/uptime");
          const health = await collectHealth();
          ok = health.ok;
        } catch {
          ok = false;
        }
        const result = await maybeNotifyOnCall(process.env, { ok, checkedAt });
        return Response.json({ ok: true, ...result });
      },
    },
  },
});

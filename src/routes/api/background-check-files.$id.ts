import { createFileRoute } from "@tanstack/react-router";
import { readBackgroundCheckFile } from "@/lib/server/background-check-records";
import { privateDocResponse } from "@/lib/server/private-docs";

export const Route = createFileRoute("/api/background-check-files/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { requireUserId } = await import("@/lib/auth/verify.server");
          const userId = await requireUserId();
          const doc = await readBackgroundCheckFile({ userId, recordId: params.id });
          return privateDocResponse(doc);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Request failed";
          const status =
            err instanceof Error && "status" in err && err.status === 403
              ? 403
              : message === "Unauthorized" || message === "Not authorized"
                ? 401
                : 404;
          return Response.json({ ok: false, error: message }, { status });
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { r2StatusFromEnv, sanitizeObjectKey } from "@/lib/server/r2";

async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

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
 * Admin-only R2 put/get. Public visitors cannot upload.
 * Session + profiles.role = 'admin', same-site, and `/api/admin/*` is already
 * redirected off `*.vercel.app` (see request-guard).
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

export const Route = createFileRoute("/api/admin/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdminCaller();
        } catch (err) {
          return fail(err);
        }

        const url = new URL(request.url);
        const key = url.searchParams.get("key")?.trim() || "";
        if (!key) {
          return Response.json({ ok: true, ...r2StatusFromEnv() });
        }

        try {
          sanitizeObjectKey(key);
          const { getR2Object, presignR2Get } = await import("@/lib/server/r2.server");
          if (url.searchParams.get("format") === "json") {
            const signed = presignR2Get(key);
            return Response.json({ ok: true, ...signed });
          }
          const object = await getR2Object(key);
          return new Response(new Uint8Array(object.body), {
            status: 200,
            headers: {
              "content-type": object.contentType,
              "content-length": String(object.bytes),
              "cache-control": "private, no-store",
              ...(object.etag ? { etag: object.etag } : {}),
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Request failed";
          const status = /not found/i.test(message)
            ? 404
            : /not configured/i.test(message)
              ? 503
              : 400;
          return Response.json({ ok: false, error: message }, { status });
        }
      },
      POST: async ({ request }) => {
        try {
          await requireAdminCaller();
        } catch (err) {
          return fail(err);
        }

        const body = await readJson(request);
        const action = String(body.action || "put")
          .trim()
          .toLowerCase();
        try {
          const key = sanitizeObjectKey(String(body.key || ""));
          const { getR2Object, presignR2Get, putR2Object } = await import("@/lib/server/r2.server");
          if (action === "get") {
            const signed = presignR2Get(key);
            if (body.includeBody === true) {
              const object = await getR2Object(key);
              return Response.json({
                ok: true,
                ...signed,
                contentType: object.contentType,
                bytes: object.bytes,
                bodyBase64: object.body.toString("base64"),
              });
            }
            return Response.json({ ok: true, ...signed });
          }
          if (action !== "put") throw new Error("action must be put or get");
          const result = await putR2Object({
            key,
            contentType: String(body.contentType || ""),
            bodyBase64: String(body.bodyBase64 || ""),
          });
          return Response.json({ ok: true, ...result });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Request failed";
          const status = /not found/i.test(message)
            ? 404
            : /not configured/i.test(message)
              ? 503
              : 400;
          return Response.json({ ok: false, error: message }, { status });
        }
      },
    },
  },
});

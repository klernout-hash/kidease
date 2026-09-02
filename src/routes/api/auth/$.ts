import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { reportError } from "@/lib/observe";

async function handleAuth(request: Request) {
  try {
    return await auth.handler(request);
  } catch (err) {
    reportError(err, { route: "/api/auth" });
    throw err;
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuth(request),
      POST: ({ request }) => handleAuth(request),
    },
  },
});

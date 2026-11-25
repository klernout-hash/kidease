import { createServerFn } from "@tanstack/react-start";
import { sessionBearerMiddleware } from "@/lib/auth/middleware";

/**
 * `/logout` and `/fr/logout`: end this browser's session on the server, so a
 * visit without JavaScript also signs out. The page then runs the normal
 * client sign-out. Never throws; a signed-out visitor gets `{ ended: false }`.
 */
export const endSessionForLogout = createServerFn({ method: "POST" })
  .middleware([sessionBearerMiddleware])
  .handler(async ({ context }): Promise<{ ended: boolean }> => {
    try {
      const { endCurrentWebSession } = await import("./persistent-session.server");
      return await endCurrentWebSession(context.bearerToken);
    } catch {
      return { ended: false };
    }
  });

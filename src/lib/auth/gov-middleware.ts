import { createMiddleware } from "@tanstack/react-start";

/**
 * Government server functions only. Parent, daycare, and admin sessions
 * are rejected. A government session is rejected by the private API
 * middleware, so the two desks do not share a call path.
 */
export const govAuthMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getBearerToken } = await import("./client");
    return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
  })
  .server(async ({ next, context }) => {
    const { assertSameSiteRequest } = await import("./isolation.server");
    const { requireUserId } = await import("./verify.server");
    const { requireGovActor } = await import("@/lib/server/gov-actor.server");
    assertSameSiteRequest();
    const userId = await requireUserId(context.bearerToken as string | undefined);
    const gov = await requireGovActor(userId);
    return next({ context: { userId, gov } });
  });

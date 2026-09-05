import { createMiddleware, createStart } from "@tanstack/react-start";
import { reportError } from "@/lib/observe";

const sentryRequestMiddleware = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  try {
    return await next();
  } catch (err) {
    const path = (() => {
      try {
        return new URL(request.url).pathname;
      } catch {
        return "ssr";
      }
    })();
    reportError(err, { route: path });
    throw err;
  }
});

const sentryFunctionMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (err) {
    reportError(err, { route: "server-fn" });
    throw err;
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [sentryRequestMiddleware],
  functionMiddleware: [sentryFunctionMiddleware],
}));

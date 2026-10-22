/**
 * Client-safe server functions. The database and the view-as frame stay in
 * view-as.ts, loaded only when a handler runs on the server.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { ViewAsPublic, ViewAsTarget } from "@/lib/view-as-public";

export type { ViewAsTarget } from "@/lib/view-as-public";

export const getViewAsState = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<{ active: false } | ({ active: true } & ViewAsPublic)> => {
    const { readViewAsState } = await import("./view-as");
    return readViewAsState();
  });

export const searchViewAsTargets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((query: string) => String(query || "").trim().slice(0, 80))
  .handler(async ({ data: query }): Promise<ViewAsTarget[]> => {
    const { searchViewAsPeople } = await import("./view-as");
    return searchViewAsPeople(query);
  });

export const startViewAs = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { targetUserId: string }) => ({
    targetUserId: String(input?.targetUserId || "").trim(),
  }))
  .handler(async ({ data }) => {
    const { beginViewAs } = await import("./view-as");
    return beginViewAs(data.targetUserId);
  });

export const exitViewAs = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { endViewAs } = await import("./view-as");
    return endViewAs();
  });

import { createServerFn } from "@tanstack/react-start";
import type { HealthPayload } from "@/lib/uptime";

export type PublicStatusPayload = {
  health: HealthPayload | null;
  checkedAt: string;
};

/**
 * Client navigations call this on the server. The database probe lives in
 * uptime.ts and is imported only inside the handler, so the browser bundle
 * never evaluates getSql(), catalog SQL, or sourced-age fills.
 */
export const loadPublicStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicStatusPayload> => {
    const checkedAt = new Date().toISOString();
    try {
      const { collectHealth } = await import("./uptime");
      return { health: await collectHealth(), checkedAt };
    } catch {
      return { health: null, checkedAt };
    }
  },
);

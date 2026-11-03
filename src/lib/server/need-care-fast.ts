import { createServerFn } from "@tanstack/react-start";
import { needCareFastQuery, parseNeedCareFastSearch } from "@/lib/need-care-fast";

/**
 * Client navigations call this on the server. The database query lives in
 * need-care-fast-page.ts and is imported only inside the handler, so the
 * browser bundle never evaluates getSql() or node built-ins.
 */
export const loadNeedCareFast = createServerFn({ method: "GET" })
  .validator((input: unknown): { q: string; lat?: number; lng?: number } => {
    if (typeof input === "string") return { q: needCareFastQuery(input) };
    return parseNeedCareFastSearch(input);
  })
  .handler(async ({ data }) => {
    const { loadNeedCareFastPage } = await import("./need-care-fast-page");
    return loadNeedCareFastPage(data.q, Date.now(), { lat: data.lat, lng: data.lng });
  });

import { createServerFn } from "@tanstack/react-start";
import { emptyVisitorLocale, type VisitorLocaleHint } from "@/lib/locale-geo";

export type { VisitorLocaleHint };

/** Page language for this request. Location is read on the server from Vercel headers. */
export const getVisitorLocale = createServerFn({ method: "GET" })
  .validator((input: { pathname?: string; search?: string } | undefined) => ({
    pathname: String(input?.pathname || "/").slice(0, 512),
    search: String(input?.search || "").slice(0, 2048),
  }))
  .handler(async ({ data }): Promise<VisitorLocaleHint> => {
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const { readVisitorLocale } = await import("@/lib/locale-choice.server");
      const request = getRequest();
      if (!request) return emptyVisitorLocale();
      return await readVisitorLocale(request, data.pathname, data.search);
    } catch {
      return emptyVisitorLocale();
    }
  });

import { createServerFn } from "@tanstack/react-start";
import type { ResolvedOrigin } from "@/lib/default-origin";

export const resolveRequestSearchOrigin = createServerFn({ method: "GET" }).handler(
  async (): Promise<ResolvedOrigin> => {
    const { requestSearchOrigin } = await import("./request-origin.server");
    return requestSearchOrigin();
  },
);

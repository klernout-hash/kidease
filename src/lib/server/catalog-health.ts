import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireAdmin } from "@/lib/server/roles";
import { readCatalogHealth } from "@/lib/server/catalog-neon";

/** Admin-only. Neon vs JSON honesty — never treats Drive / Git CSV as runtime SoT. */
export const getCatalogHealth = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    return readCatalogHealth();
  });

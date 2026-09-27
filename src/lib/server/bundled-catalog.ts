/**
 * Server entry for dropping bundled catalogue rows the database has hidden
 * or retired. City hub pages call this so the check runs on the server
 * during client navigations too.
 */

import { createServerFn } from "@tanstack/react-start";
import { filterSuppressedCatalogRows } from "@/lib/catalog-fallback";
import { loadSuppressedCatalogKeys } from "@/lib/server/catalog-neon";

export const filterSuppressedBundleRows = createServerFn({ method: "GET" })
  .validator((rows: Array<{ slug: string; name: string }>) =>
    (Array.isArray(rows) ? rows : []).filter(
      (row) => row && typeof row.slug === "string" && typeof row.name === "string",
    ),
  )
  .handler(async ({ data }) => {
    try {
      const keys = await loadSuppressedCatalogKeys();
      return filterSuppressedCatalogRows(data, keys);
    } catch {
      return data;
    }
  });

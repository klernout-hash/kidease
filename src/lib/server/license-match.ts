/**
 * Apply trusted local registry matches at read / seed time.
 *
 * Manitoba: in-memory lookup against the bundled snapshot
 * (`mb-registry-index.json`). Not a live scrape. Other provinces stay
 * unmatched until an official open-data adapter is wired.
 *
 * Never writes a licence number. Never blocks listing load on the network.
 */

import { lookupRegistry, registryLookupIsLive } from "./registry-adapters.ts";
import {
  normalizeLicenseStatus,
  normalizeMatchState,
  type TrustListing,
} from "../trust.ts";

export const LOCAL_CATALOG_SOURCE = "local_catalog";

export const PERSIST_LOCAL_LICENSE_SQL = `
update daycares
set license_status = 'matched',
    registry_match_state = 'matched',
    license_verification_source = coalesce(
      nullif(btrim(coalesce(license_verification_source, '')), ''),
      '${LOCAL_CATALOG_SOURCE}'
    )
where id = any($1::text[])
  and claimed_at is null
  and license_status not in ('expired', 'suspended', 'matched')
  and registry_match_state <> 'mismatch'
`;

export type LicenseMatchInput = TrustListing & {
  id?: string;
  province?: string | null;
};

export function applyLocalRegistryTrust<T extends LicenseMatchInput>(item: T): T {
  const status = normalizeLicenseStatus(item.licenseStatus);
  if (status === "expired" || status === "suspended") return item;
  if (normalizeMatchState(item.registryMatchState) === "mismatch") return item;
  if (status === "matched" || item.registryMatchState === "matched") {
    return {
      ...item,
      licenseStatus: "matched",
      registryMatchState: "matched",
    };
  }

  const lookup = lookupRegistry(item.province || "", item.licenseNumber);
  if (!registryLookupIsLive(lookup)) return item;

  return {
    ...item,
    licenseStatus: "matched",
    registryMatchState: "matched",
    licenseVerificationSource: item.licenseVerificationSource || lookup.match?.source || LOCAL_CATALOG_SOURCE,
  };
}

export function localCatalogMatchIds(
  rows: Array<{ id: string; province?: string | null; licenseNumber?: string | null }>,
): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (!row.id) continue;
    const lookup = lookupRegistry(row.province || "", row.licenseNumber);
    if (registryLookupIsLive(lookup)) ids.push(row.id);
  }
  return ids;
}

export async function persistLocalLicenseMatches(
  sql: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  ids: string[],
): Promise<number> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return 0;
  await sql.query(PERSIST_LOCAL_LICENSE_SQL, [wanted]);
  return wanted.length;
}

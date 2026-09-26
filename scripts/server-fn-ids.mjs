/**
 * Production TanStack Start ids are sha256(`${file}--${export}_createServerFn_handler`).
 * See generateFunctionId in @tanstack/start-plugin-core (build mode, Linux paths).
 * Dev ids are base64 and are not listed here.
 */
import { createHash } from "node:crypto";

export function productionServerFnId(filename, exportName) {
  const entry = `${filename}--${exportName}_createServerFn_handler`;
  return createHash("sha256").update(entry).digest("hex");
}

/** Public catalogue reads. Same payload for every caller. */
export const CATALOGUE_SERVER_FNS = [
  ["src/lib/server/daycares.ts", "searchDaycares"],
  ["src/lib/server/daycares.ts", "featuredDaycares"],
  ["src/lib/server/daycares.ts", "getDaycaresByIds"],
];

/**
 * Listing reads. Anonymous public listings are cacheable. A staff session can
 * see QA fixtures, so those responses stay uncached.
 */
export const LISTING_SERVER_FNS = [
  ["src/lib/server/daycares.ts", "getDaycare"],
  ["src/lib/server/daycares.ts", "getListingSeo"],
];

/** The five calls ParentDesk repeats while a signed-in tab sits on /parent. */
export const PARENT_DESK_LOOP_FNS = [
  ["src/lib/server/family.ts", "getFamily"],
  ["src/lib/server/daycares.ts", "searchDaycares"],
  ["src/lib/server/billing.ts", "listParentBills"],
  ["src/lib/server/tours.ts", "listTourRequests"],
  ["src/lib/server/lead-requests.ts", "listLeadRequests"],
];

export function idMap(rows) {
  const out = new Map();
  for (const [filename, exportName] of rows) {
    out.set(productionServerFnId(filename, exportName), exportName);
  }
  return out;
}

export const CATALOGUE_FN_IDS = idMap(CATALOGUE_SERVER_FNS);
export const LISTING_FN_IDS = idMap(LISTING_SERVER_FNS);

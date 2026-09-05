/**
 * Per-jurisdiction registry adapters.
 *
 * These are documented stubs. Do not add a "Sync now" button that pretends a
 * live scrape exists. When an adapter is wired, lookup() returns facts from
 * that province or territory's official source and the admin review can mark
 * registry-matched from those facts.
 *
 * TODO (follow-up PRs, not this UI):
 * - MB: childcaresearch.gov.mb.ca — licence #, status, expiry, capacity
 * - ON / BC / AB / others: official open data or lookup pages when a stable API exists
 */

import { JURISDICTIONS, type AdapterStatus } from "@/lib/province-registry";

export { adapterStatusLabel } from "@/lib/province-registry";

export type RegistryLookup = {
  ok: false;
  status: AdapterStatus;
  reason: "stub" | "manual" | "missing_number";
  notes: string;
  registryUrl: string | null;
};

export function lookupRegistry(code: string, licenseNumber?: string | null): RegistryLookup {
  const j = JURISDICTIONS.find((row) => row.code === code.toUpperCase());
  const number = (licenseNumber || "").trim();
  if (!j) {
    return {
      ok: false,
      status: "stub",
      reason: "stub",
      notes: "Unknown jurisdiction. KidEase does not invent a registry match.",
      registryUrl: null,
    };
  }
  if (!number) {
    return {
      ok: false,
      status: j.adapterStatus,
      reason: "missing_number",
      notes: "No licence number on file. Mark unverified until the operator or an adapter supplies one.",
      registryUrl: j.registryUrl,
    };
  }
  return {
    ok: false,
    status: j.adapterStatus,
    reason: j.adapterStatus === "manual" ? "manual" : "stub",
    notes: j.adapterNotes,
    registryUrl: j.registryUrl,
  };
}

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { decodeImportText, nameIsCityPostalLabel } from "../src/lib/catalog-match.ts";
import { looksLikeLicenceHash } from "../src/lib/licensing.ts";
import { isPostalCodeName } from "../src/lib/search-result-quality.ts";

export function auditListingIdentity(rows) {
  return rows.flatMap((row, index) => {
    const name = decodeImportText(row.name);
    const issues = [];
    if (looksLikeLicenceHash(row.licenseNumber ?? row.license_number ?? row.licence_number)) {
      issues.push("hash-like licence");
    }
    if (isPostalCodeName(name) || nameIsCityPostalLabel(name)) {
      issues.push("postal-code name");
    }
    return issues.length ? [{ row: index + 1, id: row.id ?? null, issues }] : [];
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: node scripts/audit-listing-identity.mjs <catalogue-export.json>");
    process.exitCode = 2;
  } else {
    const rows = JSON.parse(readFileSync(input, "utf8"));
    if (!Array.isArray(rows)) throw new Error("Expected a JSON array of listing rows.");
    const findings = auditListingIdentity(rows);
    console.log(JSON.stringify(findings, null, 2));
    process.exitCode = findings.length ? 1 : 0;
  }
}

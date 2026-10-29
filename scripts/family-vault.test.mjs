import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { canShareWithCentre, familyDocStorageKey, isFamilyDocKind, shareIsOpen } from "../src/lib/family-vault.ts";
import { isPrivateR2Key } from "../src/lib/private-docs.ts";
import { isPrivateDocKey } from "../src/lib/server/r2.ts";
import { PARENT_PRIMARY_NAV_IDS } from "../src/lib/desk-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("vault keys stay under family-docs and only two kinds are allowed", () => {
  const key = familyDocStorageKey("user_1", "fd_abc", "pdf");
  assert.equal(key, "family-docs/user_1/fd_abc.pdf");
  assert.equal(isPrivateR2Key(key), true);
  assert.equal(isPrivateDocKey(key), true);
  assert.equal(isPrivateDocKey("originals/wpg/1.jpg"), false);
  assert.equal(isFamilyDocKind("immunization"), true);
  assert.equal(isFamilyDocKind("subsidy"), true);
  assert.equal(isFamilyDocKind("licence"), false);
  assert.equal(canShareWithCentre("centre-a", ["centre-a"]), true);
  assert.equal(canShareWithCentre("centre-b", ["centre-a"]), false);
  assert.equal(canShareWithCentre("  ", ["centre-a"]), false);
  assert.equal(shareIsOpen(null), true);
  assert.equal(shareIsOpen("2026-10-01T00:00:00.000Z"), false);
});

test("vault is private, bilingual, and not a sixth phone tab", () => {
  const copy = src("src/lib/copy.ts");
  const account = src("src/routes/account.tsx");
  const api = src("src/routes/api/family-documents.ts");
  const download = src("src/routes/api/family-documents.$id.ts");
  const migration = src("migrations/0092_family_documents.sql");
  assert.match(copy, /familyDocsTitle: "Your documents"/);
  assert.match(copy, /familyDocsTitle: "Vos documents"/);
  assert.match(copy, /familyDocsImmunization: "Immunization record"/);
  assert.match(copy, /familyDocsImmunization: "Carnet de vaccination"/);
  assert.doesNotMatch(copy, /familyDocs[\s\S]{0,400}United States|familyDocs[\s\S]{0,80}state /);
  assert.match(account, /section === "documents"/);
  assert.match(account, /ChildDataRetired/);
  assert.doesNotMatch(account, /FamilyVaultPanel/);
  assert.match(src("src/lib/server/family-vault.ts"), /kind === "immunization"/);
  assert.equal(PARENT_PRIMARY_NAV_IDS.includes("documents"), false);
  assert.equal(PARENT_PRIMARY_NAV_IDS.length, 5);
  assert.match(api, /requireUserId/);
  assert.match(download, /loadFamilyDocumentFor/);
  assert.match(download, /attachment;/);
  assert.match(download, /no-store/);
  assert.doesNotMatch(download, /storage_ref/);
  assert.match(migration, /kind in \('immunization', 'subsidy'\)/);
  assert.match(migration, /revoked_at is null/);
  assert.match(src("src/lib/server/family.ts"), /purgeFamilyDocuments/);
  assert.match(src("src/routes/provider.tsx"), /CentreFamilyDocs/);
  assert.doesNotMatch(src("src/lib/family-vault.ts"), /stripe|STORE_PAYMENTS_ENABLED/);
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  collectPhotoFiles,
  collectPhotoInventory,
  inventorySummary,
  parseMigrateArgs,
  runMigrate,
} from "./migrate-photos-to-r2.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("CLI defaults to dry-run and rejects unknown flags", () => {
  assert.deepEqual(parseMigrateArgs([]).dryRun, true);
  assert.equal(parseMigrateArgs([]).apply, false);
  assert.equal(parseMigrateArgs(["--apply"]).apply, true);
  assert.equal(parseMigrateArgs(["--only", "buildings", "--limit", "2"]).only, "buildings");
  assert.equal(parseMigrateArgs(["--only", "buildings", "--limit", "2"]).limit, 2);
  assert.throws(() => parseMigrateArgs(["--hack-the-planet"]), /Unknown argument/);
});

test("inventory counts Git photos and maps them to originals/ keys", () => {
  const inventory = collectPhotoInventory(root);
  assert.ok(inventory.filesOnDisk >= 800, "expected the Winnipeg photo tree");
  assert.equal(inventory.keyPrefix, "originals/");
  assert.match(inventory.mapping, /originals\/\{rel\}/);
  assert.equal(inventory.byDir.wpg >= 700, true);
  assert.equal(inventory.byDir.buildings >= 20, true);
  assert.equal(inventory.listings.wpgStorefronts.mapped, 711);
  assert.equal(inventory.listings.wpgStorefronts.missingOnDisk, 0);
  assert.equal(inventory.listings.officialBuildings.mapped, 65);
  assert.equal(inventory.listings.officialBuildings.onDisk, 22);
  assert.equal(inventory.listings.officialBuildings.missingOnDisk, 43);
  assert.ok(inventory.listings.officialBuildings.missingIds.includes("mb-1001"));
  assert.equal(inventory.tooLarge.length, 0);

  const files = collectPhotoFiles(root);
  const building = files.find((f) => f.src === "/photos/buildings/mb-1014.jpg");
  assert.ok(building);
  assert.equal(building.key, "originals/buildings/mb-1014.jpg");
  assert.equal(building.contentType, "image/jpeg");
  assert.ok(existsSync(building.abs));

  const summary = inventorySummary(inventory);
  assert.equal("files" in summary, false);
  assert.equal(summary.filesOnDisk, inventory.filesOnDisk);
});

test("dry-run and --apply without R2 env never upload and never echo secrets", async () => {
  const dry = await runMigrate(["--dry-run", "--only", "buildings", "--limit", "1"], root, {});
  assert.equal(dry.ok, true);
  assert.equal(dry.plan.mode, "dry-run");
  assert.equal(dry.plan.planned, 1);
  assert.equal(dry.plan.sample[0].key.startsWith("originals/buildings/"), true);

  const blocked = await runMigrate(["--apply", "--only", "buildings", "--limit", "1"], root, {});
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /R2 is not configured/);
  assert.deepEqual(blocked.missing, ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT"]);
  assert.doesNotMatch(JSON.stringify(blocked), /sk_|AKIA|password|secret-key/i);

  const help = await runMigrate(["--help"], root, {});
  assert.match(help.help, /R2_ACCESS_KEY_ID/);
  assert.match(help.help, /never deleted/);
});

test("runbook and package scripts exist; Git photos are still on disk", () => {
  const runbook = readFileSync(join(root, "scripts/r2-photo-migrate.md"), "utf8");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const img = readFileSync(join(root, "src/lib/server/optimize-photo.ts"), "utf8");
  assert.match(runbook, /originals\/wpg\/1001\.jpg/);
  assert.match(runbook, /Do not delete/);
  assert.match(runbook, /npx vercel env pull/);
  assert.equal(pkg.scripts["photos:inventory"].includes("migrate-photos-to-r2.mjs"), true);
  assert.equal(pkg.scripts["photos:migrate-r2"].includes("migrate-photos-to-r2.mjs"), true);
  assert.match(img, /readListingOriginal/);
  assert.match(img, /r2ReadOriginalsEnabled/);
  assert.equal(existsSync(join(root, "public/photos/buildings/mb-1014.jpg")), true);
  assert.equal(existsSync(join(root, "public/photos/wpg/1001.jpg")), true);
});

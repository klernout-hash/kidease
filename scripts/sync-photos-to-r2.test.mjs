import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_PHOTOS_DIR,
  PUBLIC_R2_PREFIX,
  awsCliChildEnv,
  buildPhotoSyncPlan,
  listingSrcToPublicR2Key,
  parseSyncArgs,
  runPhotoSync,
} from "./sync-photos-to-r2.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("public R2 keys keep the same /photos relative paths", () => {
  assert.equal(listingSrcToPublicR2Key("/photos/buildings/mb-1001.jpg"), "photos/buildings/mb-1001.jpg");
  assert.equal(listingSrcToPublicR2Key("/photos/wpg/1001.jpg"), "photos/wpg/1001.jpg");
  assert.equal(listingSrcToPublicR2Key("/photos/../etc/passwd"), null);
  assert.equal(listingSrcToPublicR2Key("https://evil.example/x.jpg"), null);
  assert.equal(PUBLIC_R2_PREFIX, "photos");
  assert.equal(PUBLIC_PHOTOS_DIR, "public/photos");
  assert.equal(existsSync(join(root, "public/photos/wpg/1001.jpg")), true);
  assert.equal(existsSync(join(root, "public/photos/buildings/mb-1014.jpg")), true);
});

test("aws s3 sync plan is env-based and defaults to dry-run", async () => {
  assert.deepEqual(parseSyncArgs([]), { apply: false, dryRun: true, help: false });
  assert.equal(parseSyncArgs(["--apply"]).apply, true);
  assert.throws(() => parseSyncArgs(["--hack"]), /Unknown argument/);

  const empty = buildPhotoSyncPlan({}, {});
  assert.deepEqual(empty.missing, ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT"]);
  assert.match(empty.command, /aws s3 sync public\/photos s3:\/\/kidease-media\/photos/);
  assert.match(empty.command, /--dryrun/);
  assert.doesNotMatch(empty.command, /AKIA|hunter2|secret-key/i);

  const plan = buildPhotoSyncPlan(
    {
      R2_ACCESS_KEY_ID: "test-access-key",
      R2_SECRET_ACCESS_KEY: "test-secret-key-not-real",
      R2_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
      R2_BUCKET: "kidease-media",
    },
    { apply: true },
  );
  assert.deepEqual(plan.missing, []);
  assert.equal(plan.dest, "s3://kidease-media/photos");
  assert.deepEqual(plan.awsArgs, [
    "s3",
    "sync",
    "public/photos",
    "s3://kidease-media/photos",
    "--endpoint-url",
    "https://acct.r2.cloudflarestorage.com",
    "--region",
    "auto",
  ]);
  assert.doesNotMatch(plan.command, /test-secret-key-not-real/);

  const child = awsCliChildEnv({
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret-key-not-real",
  });
  assert.equal(child.AWS_ACCESS_KEY_ID, "test-access-key");
  assert.equal(child.AWS_DEFAULT_REGION, "auto");

  const blocked = await runPhotoSync(["--apply"], {});
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /R2 is not configured/);
  assert.deepEqual(blocked.missing, ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT"]);
  assert.doesNotMatch(JSON.stringify(blocked), /sk_|AKIA|password|secret-key/i);
});

test("runbook and env example list public R2 names only", () => {
  const runbook = readFileSync(join(root, "scripts/r2-public-photos.md"), "utf8");
  const envExample = readFileSync(join(root, ".env.example"), "utf8");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.match(runbook, /aws s3 sync public\/photos/);
  assert.match(runbook, /https:\/\/media\.kidease\.ca/);
  assert.match(runbook, /R2_ACCESS_KEY_ID/);
  assert.match(runbook, /Do not delete `public\/photos`/);
  assert.match(runbook, /listingPhotosFor/);
  assert.doesNotMatch(runbook, /R2_SECRET_ACCESS_KEY=\S+/);
  assert.match(envExample, /R2_PUBLIC_BASE_URL=/);
  assert.match(envExample, /VITE_R2_PUBLIC_BASE_URL=/);
  assert.doesNotMatch(envExample, /R2_PUBLIC_BASE_URL=\S+/);
  assert.doesNotMatch(envExample, /VITE_R2_PUBLIC_BASE_URL=\S+/);
  assert.equal(pkg.scripts["photos:sync-r2"].includes("sync-photos-to-r2.mjs"), true);
});

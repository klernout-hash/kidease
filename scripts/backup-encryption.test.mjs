import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function step(workflow, name) {
  const source = readFileSync(new URL(`../.github/workflows/${workflow}.yml`, import.meta.url), "utf8");
  const block = source.split(`      - name: ${name}\n`)[1].split("\n      - name:")[0];
  return block.split("        run: |\n")[1].replace(/^ {10}/gm, "");
}

function fixture(t, workDir) {
  const root = mkdtempSync(join(tmpdir(), "kidease-backup-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, workDir);
  mkdirSync(dir);
  return { root, dir };
}

function run(script, root, env = {}, mock = "") {
  return spawnSync("bash", ["-c", mock + "\n" + script], {
    encoding: "utf8",
    env: { ...process.env, RUNNER_TEMP: root, BACKUP_ENCRYPTION_PUBLIC_KEY: "", BACKUP_ENCRYPTION_IDENTITY: "", ...env },
  });
}

test("backup requires encryption and removes plaintext after encryption succeeds", (t) => {
  const { root, dir } = fixture(t, "backup");
  const plaintext = join(dir, "db.dump");
  const ciphertext = `${plaintext}.age`;
  const encrypt = step("db-backup", "Encrypt the checked dump");
  writeFileSync(plaintext, "synthetic dump");
  const fakeAge = 'age() { test "$1" = --encrypt && test -s "$6" && printf ciphertext > "$5"; }';
  assert.notEqual(run(encrypt, root, {}, fakeAge).status, 0);
  assert.equal(existsSync(ciphertext), false);
  const encrypted = run(encrypt, root, { BACKUP_ENCRYPTION_PUBLIC_KEY: "synthetic-recipient" }, fakeAge);
  assert.equal(encrypted.status, 0, encrypted.stderr);
  assert.equal(existsSync(plaintext), false);
  assert.equal(readFileSync(ciphertext, "utf8"), "ciphertext");
  const upload = step("db-backup", "Upload encrypted backup to R2");
  assert.match(upload, /file="\$RUNNER_TEMP\/backup\/db\.dump\.age"/);
  assert.match(upload, /weekly\/\$\{day\}\.dump\.age/);
  assert.match(upload, /monthly\/.*\.dump\.age/);
});

test("restore fails without an identity or when ciphertext authentication fails", (t) => {
  const { root, dir } = fixture(t, "restore");
  writeFileSync(join(dir, "db.dump.age"), "synthetic ciphertext");
  const decrypt = step("db-restore-test", "Decrypt and validate the backup");
  const pgRestore = 'pg_restore() { touch "$RUNNER_TEMP/validated"; }';
  const rejected = run(decrypt, root, { BACKUP_ENCRYPTION_IDENTITY: "synthetic-identity" }, `age() { return 1; }; ${pgRestore}`);
  assert.notEqual(rejected.status, 0);
  assert.equal(existsSync(join(root, "validated")), false);
  const fakeAge = 'age() { test "$1" = --decrypt && test -s "$6" && printf plaintext > "$5"; }';
  assert.notEqual(run(decrypt, root, {}, `${fakeAge}; ${pgRestore}`).status, 0);
  assert.equal(existsSync(join(root, "validated")), false);
  const verified = run(decrypt, root, { BACKUP_ENCRYPTION_IDENTITY: "synthetic-identity" }, `${fakeAge}; ${pgRestore}`);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(existsSync(join(root, "validated")), true);
});

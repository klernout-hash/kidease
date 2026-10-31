/**
 * Weekly Neon dump to R2, then `pg_restore --list` as a restore check.
 * Failure is recorded on the run row so the ops mail can page Kyle.
 * Does not print DATABASE_URL. Does not touch subscriptions.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AUTOMATION_FALLBACK_TZ,
  automationModeFromEnv,
  backupDue,
  backupObjectKey,
  dayKeyInTimeZone,
  pgConnEnv,
  restoreListLooksValid,
} from "@/lib/automations";
import { runTracked } from "@/lib/server/automation-ops";
import { headR2Object, putR2BackupBytes } from "@/lib/server/r2.server";

const BACKUP_MAX_BYTES = 200 * 1024 * 1024;

function runCommand(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (stdout.length < 8000) stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 800) stderr += String(chunk);
    });
    child.on("error", () => resolve({ code: 127, stdout, stderr: stderr || "command_missing" }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export async function runNeonBackupJob(options: { dryRun?: boolean; now?: Date; force?: boolean } = {}) {
  return runTracked("neon-backup", async () => {
    const now = options.now ?? new Date();
    const mode = automationModeFromEnv("FEATURE_NEON_BACKUP", process.env, Boolean(options.dryRun));
    if (mode === "off") return { ok: true, skipped: true, reason: "flag_off" };
    if (!backupDue(now, Boolean(options.force))) return { ok: true, skipped: true, reason: "not_sunday" };
    const day = dayKeyInTimeZone(now, AUTOMATION_FALLBACK_TZ);
    const key = backupObjectKey(day);
    const conn = pgConnEnv(process.env.DATABASE_URL);
    if (!conn.ok) return { ok: false, reason: conn.error === "missing" ? "no_database" : "bad_database_url" };
    if (mode === "dry_run") {
      console.info("[kidease-automation] dry-run backup", key);
      return { ok: true, skipped: false, dryRun: true, key };
    }
    const dir = await mkdtemp(join(tmpdir(), "kidease-backup-"));
    const file = join(dir, "neon.dump");
    try {
      const dump = await runCommand(
        "pg_dump",
        ["--format=custom", "--no-password", "--file", file],
        { ...process.env, ...conn.env },
      );
      if (dump.code !== 0) return { ok: false, reason: "pg_dump_failed" };
      const info = await stat(file);
      if (!info.size || info.size > BACKUP_MAX_BYTES) return { ok: false, reason: "backup_size" };
      const listed = await runCommand("pg_restore", ["--list", file], process.env);
      if (listed.code !== 0 || !restoreListLooksValid(listed.stdout)) return { ok: false, reason: "restore_check_failed" };
      const body = await readFile(file);
      await putR2BackupBytes({ key, body });
      const head = await headR2Object(key);
      if (!head.exists || head.bytes !== body.byteLength) return { ok: false, reason: "upload_mismatch" };
      return { ok: true, skipped: false, key, bytes: body.byteLength };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
}

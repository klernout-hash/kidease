/**
 * Sync Git `public/photos` into the public R2 key prefix `photos/`.
 *
 * Same relative paths as the repo (do not invent listing assignments):
 *   public/photos/buildings/mb-1001.jpg → photos/buildings/mb-1001.jpg
 *   public/photos/wpg/1001.jpg          → photos/wpg/1001.jpg
 *
 * Default is dry-run (`aws s3 sync --dryrun`). `--apply` writes. Credentials
 * come from R2_* env only — never hardcoded. Does not delete Git photos.
 *
 *   npm run photos:sync-r2
 *   npm run photos:sync-r2 -- --apply
 *
 * See scripts/r2-public-photos.md.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
/** Same default as src/lib/server/r2.ts — kept local so this CLI stays Node-testable. */
export const R2_DEFAULT_BUCKET = "kidease-media";
export const PUBLIC_PHOTOS_DIR = "public/photos";
export const PUBLIC_R2_PREFIX = "photos";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function listingSrcToPublicR2Key(src) {
  const path = String(src ?? "");
  if (!path.startsWith("/photos/") || path.includes("..")) return null;
  return path.slice(1);
}

export function parseSyncArgs(argv) {
  const args = { apply: false, dryRun: true, help: false };
  for (const token of argv) {
    if (token === "--apply") {
      args.apply = true;
      args.dryRun = false;
    } else if (token === "--dry-run" || token === "--dryrun") {
      args.dryRun = true;
      args.apply = false;
    } else if (token === "--help" || token === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return args;
}

function envTrim(env, key) {
  return String(env?.[key] ?? "").trim();
}

export function r2S3Endpoint(env = {}) {
  const explicit = envTrim(env, "R2_ENDPOINT");
  if (explicit) return explicit;
  const accountId = envTrim(env, "R2_ACCOUNT_ID");
  if (accountId) return `https://${accountId}.r2.cloudflarestorage.com`;
  return "";
}

export function syncEnvMissing(env = {}) {
  const missing = [];
  if (!envTrim(env, "R2_ACCESS_KEY_ID")) missing.push("R2_ACCESS_KEY_ID");
  if (!envTrim(env, "R2_SECRET_ACCESS_KEY")) missing.push("R2_SECRET_ACCESS_KEY");
  if (!r2S3Endpoint(env)) missing.push("R2_ENDPOINT");
  return missing;
}

export function buildPhotoSyncPlan(env = {}, options = {}) {
  const apply = Boolean(options.apply);
  const bucket = envTrim(env, "R2_BUCKET") || R2_DEFAULT_BUCKET;
  const endpoint = r2S3Endpoint(env);
  const dest = `s3://${bucket}/${PUBLIC_R2_PREFIX}`;
  const awsArgs = [
    "s3",
    "sync",
    PUBLIC_PHOTOS_DIR,
    dest,
    "--endpoint-url",
    endpoint || "<R2_ENDPOINT>",
    "--region",
    "auto",
  ];
  if (!apply) awsArgs.push("--dryrun");
  return {
    apply,
    local: PUBLIC_PHOTOS_DIR,
    dest,
    bucket,
    endpoint,
    prefix: PUBLIC_R2_PREFIX,
    missing: syncEnvMissing(env),
    awsArgs,
    command: ["aws", ...awsArgs].join(" "),
  };
}

export function awsCliChildEnv(env = {}) {
  const child = { ...process.env };
  const access = envTrim(env, "R2_ACCESS_KEY_ID");
  const secret = envTrim(env, "R2_SECRET_ACCESS_KEY");
  if (access) child.AWS_ACCESS_KEY_ID = access;
  if (secret) child.AWS_SECRET_ACCESS_KEY = secret;
  child.AWS_DEFAULT_REGION = "auto";
  return child;
}

export const SYNC_HELP = `Sync public/photos → s3://$R2_BUCKET/photos (same relative keys).

  npm run photos:sync-r2              dry-run (default)
  npm run photos:sync-r2 -- --apply   write objects

Required env (names only; never commit values):
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_ENDPOINT   (or R2_ACCOUNT_ID)
  R2_BUCKET     (defaults to kidease-media)

Does not delete public/photos. Does not change listing id→path maps.
`;

function runAws(plan, env) {
  return new Promise((resolve) => {
    const child = spawn("aws", plan.awsArgs, {
      cwd: root,
      env: awsCliChildEnv(env),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      resolve({
        ok: false,
        error: err.code === "ENOENT" ? "aws CLI is not installed." : err.message,
      });
    });
    child.on("close", (code) => {
      const combined = `${stdout}\n${stderr}`;
      const secret = envTrim(env, "R2_SECRET_ACCESS_KEY");
      if (secret && combined.includes(secret)) {
        resolve({ ok: false, error: "Refusing to print R2_SECRET_ACCESS_KEY from aws output." });
        return;
      }
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
        error: code === 0 ? null : stderr.trim() || `aws exited ${code}`,
      });
    });
  });
}

export async function runPhotoSync(argv, env = process.env) {
  let flags;
  try {
    flags = parseSyncArgs(argv);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (flags.help) return { ok: true, help: SYNC_HELP };
  const plan = buildPhotoSyncPlan(env, { apply: flags.apply });
  if (!existsSync(join(root, PUBLIC_PHOTOS_DIR))) {
    return { ok: false, error: "public/photos is missing; refusing to sync.", plan };
  }
  if (plan.missing.length) {
    return {
      ok: false,
      error: `R2 is not configured. Set ${plan.missing.join(", ")}.`,
      missing: plan.missing,
      plan,
    };
  }
  if (!flags.apply) {
    return { ok: true, plan };
  }
  const aws = await runAws(plan, env);
  return { ...aws, plan };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const result = await runPhotoSync(process.argv.slice(2));
  if (result.help) {
    process.stdout.write(result.help);
    process.exit(0);
  }
  if (result.plan) {
    process.stdout.write(`${result.plan.command}\n`);
    process.stdout.write(`${result.plan.local} → ${result.plan.dest}\n`);
    process.stdout.write(result.plan.apply ? "mode: apply\n" : "mode: dry-run\n");
  }
  if (!result.ok) {
    process.stderr.write(`${result.error}\n`);
    process.exit(1);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

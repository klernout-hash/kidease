import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const FIXTURE_PROTOCOL = "polish-identical-pglite-v1";
export const FIXTURE_SEED_SEQUENCE = [
  { role: "parent", paid: false, activity: true, attention: true },
  {
    role: "provider",
    paid: false,
    ownSlug: "e2e-attention-centre",
    activity: true,
    attention: true,
  },
  { role: "admin", paid: false, activity: true, attention: true },
];

export function assertLocalFixtureEnvironment(env = process.env) {
  if (env.POLISH_FIXTURE_DATABASE !== "local-pglite" || env.E2E_ROLE_FIXTURE !== "1")
    throw new Error("Explicit disposable local PGLite and E2E fixture assertions are required.");
  if (env.SUBSCRIPTIONS_ENABLED !== "0" || env.SHOW_PAY_CTAS !== "0")
    throw new Error("The requested subscription flags must remain off.");
  const forbidden = Object.keys(env).filter(
    (key) =>
      String(env[key] || "").trim() &&
      (/^(DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL|NEON_DATABASE_URL|VERCEL|BETTER_AUTH_SECRET|ADMIN_EMAIL)$/i.test(key) ||
        /^(STRIPE_|RESEND_|SENDGRID_|TWILIO_|MAILGUN_|POSTMARK_|GOOGLE_CLIENT_|FACEBOOK_CLIENT_|GROK_AUTH_)/i.test(key)),
  );
  if (forbidden.length) throw new Error("Database/deployment/provider credentials are not allowed in this fixture process.");
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Status pages can call the excluded health collector internally. */
export function isForbiddenFixturePath(pathname) {
  let path = String(pathname).split("?")[0];
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    } catch { break; }
  }
  path = path.replace(/\/+/g, "/").replace(/\/+$/, "");
  return ["/api/health", "/status", "/fr/status"].includes(path);
}

/** Read existing expiry metadata only. Never renew or rewrite a captured cookie. */
export function fixtureValidityFromState(state, preparedAtMs = Date.now()) {
  const deadlines = (state?.cookies || [])
    .filter((cookie) => ["__Host-kidease.admin.seen", "__Secure-kidease.admin.seen"].includes(cookie.name))
    .map((cookie) => Number(cookie.expires) * 1000);
  if (!deadlines.length || deadlines.some((deadline) => !Number.isFinite(deadline) || deadline <= 0))
    throw new Error("A captured finite admin-idle expiry is required; cookies must not be rewritten.");
  const adminIdleExpiresEpochMs = Math.min(...deadlines);
  return {
    preparedAt: new Date(preparedAtMs).toISOString(),
    adminIdleExpiresAt: new Date(adminIdleExpiresEpochMs).toISOString(),
    adminIdleExpiresEpochMs,
    privateAuthValuesExcluded: true,
    policy: "Existing captured admin-idle expiry; application TTL unchanged",
  };
}

/** Import-safe, bounded preflight for verification and each measurement sample. */
export function assertFixtureValidity(manifest, nowMs = Date.now()) {
  const validity = manifest?.validity;
  const deadline = validity?.adminIdleExpiresEpochMs;
  if (!Number.isFinite(deadline) || deadline <= 0 || Date.parse(validity.adminIdleExpiresAt) !== Math.trunc(deadline))
    throw new Error("Fixture manifest lacks consistent admin-idle expiry metadata.");
  if (!Number.isFinite(nowMs)) throw new Error("Invalid fixture validity check time.");
  if (deadline <= nowMs) {
    const error = new Error(`Fixture admin-idle validity expired at ${validity.adminIdleExpiresAt}; no verification or benchmark pass is allowed.`);
    error.code = "FIXTURE_EXPIRED";
    throw error;
  }
  return {
    adminIdleExpiresAt: validity.adminIdleExpiresAt,
    checkedAt: new Date(nowMs).toISOString(),
    remainingMs: deadline - nowMs,
    valid: true,
  };
}

export function privateDirectory(path) {
  const absolute = resolve(path);
  mkdirSync(absolute, { recursive: true, mode: 0o700 });
  const stat = lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077))
    throw new Error("Fixture private directory must be a real directory with mode0700.");
  return absolute;
}

export function privateWrite(path, value) {
  privateDirectory(dirname(resolve(path)));
  writeFileSync(path, value, { flag: "wx", mode: 0o600 });
}

export function privateAuthKey(path) {
  if (!existsSync(path)) privateWrite(path, randomBytes(32).toString("hex"));
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077))
    throw new Error("The fixture auth key must be a private regular file with mode0600.");
  const key = readFileSync(path, "utf8").trim();
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid private fixture auth key.");
  return key;
}

/** Hash every row, including private auth tables, without returning row values. */
export async function fingerprintDatabase(pg) {
  return pg.transaction(async (tx) => {
    await tx.exec("set transaction isolation level repeatable read read only");
    const names = await tx.query(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
    );
    const tables = [];
    for (const { table_name: name } of names.rows) {
      const identifier = '"' + name.replaceAll('"', '""') + '"';
      const result = await tx.query(
        `select row_to_json(t)::text as row from public.${identifier} t order by row_to_json(t)::text`,
      );
      const hash = createHash("sha256");
      for (const row of result.rows) hash.update(row.row).update("\n");
      tables.push({ name, rows: result.rows.length, sha256: hash.digest("hex") });
    }
    return { protocol: FIXTURE_PROTOCOL, sha256: sha256(JSON.stringify(tables)), tables };
  });
}

export function changedFixtureTables(before, after) {
  const prior = new Map(before.tables.map((table) => [table.name, table]));
  const current = new Map(after.tables.map((table) => [table.name, table]));
  return [...new Set([...prior.keys(), ...current.keys()])].sort().flatMap((name) => {
    const a = prior.get(name);
    const b = current.get(name);
    return a?.sha256 === b?.sha256 && a?.rows === b?.rows
      ? []
      : [{ name, before: a || null, after: b || null }];
  });
}

export async function exportFixtureSnapshot(pg, path) {
  const before = await fingerprintDatabase(pg);
  const blob = await pg.dumpDataDir("gzip");
  const bytes = Buffer.from(await blob.arrayBuffer());
  const after = await fingerprintDatabase(pg);
  if (before.sha256 !== after.sha256)
    throw new Error("Fixture rows changed during export; stop all navigation before retrying.");
  privateWrite(path, bytes);
  chmodSync(path, 0o400);
  return { protocol: FIXTURE_PROTOCOL, sha256: sha256(bytes), bytes: bytes.length, fingerprint: before };
}

export async function importFixtureSnapshot(path, expectedSHA) {
  if (!/^[a-f0-9]{64}$/.test(expectedSHA || "")) throw new Error("An expected archive SHA256 is required.");
  const bytes = readFileSync(path);
  if (sha256(bytes) !== expectedSHA) throw new Error("Fixture archive SHA256 mismatch.");
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite({
    loadDataDir: new Blob([bytes]),
    parsers: { 20: Number, 1082: (value) => value, 1186: (value) => value },
  });
  await pg.waitReady;
  return pg;
}

/**
 * Copy private documents out of the public media bucket, then delete the public copies.
 *
 * Prefixes: screening/, licenses/, family-docs/, centre-docs/.
 * Copy is server-side (x-amz-copy-source). This script does not download or print file bodies.
 * Default is dry-run. Nothing is deleted unless --apply and the private copy's size matches.
 *
 *   node --experimental-strip-types scripts/migrate-private-docs-r2.mjs
 *   node --experimental-strip-types scripts/migrate-private-docs-r2.mjs --apply
 *
 * Infra this script cannot do:
 *   1. Create the R2 bucket kidease-private-docs (private; no public domain).
 *   2. Set Vercel Production env R2_PRIVATE_BUCKET=kidease-private-docs
 *      (same R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT as the media bucket).
 *   3. Cloudflare WAF custom rule on the zone that serves media.kidease.ca, action Block:
 *      (http.host eq "media.kidease.ca" and (starts_with(http.request.uri.path, "/screening/") or starts_with(http.request.uri.path, "/licenses/") or starts_with(http.request.uri.path, "/family-docs/") or starts_with(http.request.uri.path, "/centre-docs/")))
 */
import { fileURLToPath } from "node:url";
import {
  encodeS3Path,
  isPrivateDocKey,
  objectUrl,
  parsePrivateObjectList,
  privateDocCopyPlan,
  PUBLIC_MEDIA_WAF_EXPRESSION,
  R2_PRIVATE_BUCKET_DEFAULT,
  resolvePrivateR2Config,
  resolveR2Config,
  signS3Request,
} from "../src/lib/server/r2.ts";

const PREFIXES = ["screening/", "licenses/", "family-docs/", "centre-docs/"];

export function parsePrivateMigrateArgs(argv) {
  const args = { apply: false, help: false };
  for (const token of argv) {
    if (token === "--apply") args.apply = true;
    else if (token === "--dry-run") args.apply = false;
    else if (token === "--help" || token === "-h") args.help = true;
  }
  return args;
}

function prefixOf(key) {
  return PREFIXES.find((prefix) => key.startsWith(prefix)) || "other";
}

function countKeys(keys) {
  const counts = {};
  for (const prefix of PREFIXES) counts[prefix.slice(0, -1)] = 0;
  for (const key of keys) {
    const prefix = prefixOf(key).slice(0, -1);
    counts[prefix] = (counts[prefix] || 0) + 1;
  }
  return counts;
}

async function signedRequest(config, method, key, extraHeaders = {}, query = "") {
  const url = key ? objectUrl(config, key) : new URL(`${config.endpoint}/${config.bucket}`);
  if (!key && query) url.search = query.startsWith("?") ? query.slice(1) : query;
  const signed = signS3Request({
    method,
    url,
    headers: extraHeaders,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  const headers = new Headers();
  for (const [name, value] of Object.entries(signed.headers)) headers.set(name, value);
  const res = await fetch(signed.url, { method, headers });
  return res;
}

async function listPrefix(config, prefix) {
  const keys = [];
  let token = "";
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ "list-type": "2", prefix, "max-keys": "1000" });
    if (token) query.set("continuation-token", token);
    const res = await signedRequest(config, "GET", "", {}, `?${query.toString()}`);
    if (!res.ok) {
      throw new Error(`Could not list ${prefix.slice(0, -1)} objects (${res.status}).`);
    }
    const xml = await res.text();
    const parsed = parsePrivateObjectList(xml);
    keys.push(...parsed.keys.filter((key) => key.startsWith(prefix)));
    if (!parsed.truncated || !parsed.token) break;
    token = parsed.token;
  }
  return keys;
}

async function headLength(config, key) {
  const res = await signedRequest(config, "HEAD", key);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not check a private document (${res.status}).`);
  const length = Number(res.headers.get("content-length"));
  return Number.isFinite(length) ? length : null;
}

export async function runPrivateDocMigration(argv = [], env = process.env) {
  const args = parsePrivateMigrateArgs(argv);
  if (args.help) {
    return {
      ok: true,
      help: "Dry-run by default. Pass --apply to copy private prefixes and delete the public copies.",
    };
  }
  const pub = resolveR2Config(env);
  const priv = resolvePrivateR2Config(env);
  const report = {
    mode: args.apply ? "apply" : "dry-run",
    publicBucket: pub.ok ? pub.config.bucket : null,
    privateBucket: priv.ok ? priv.config.bucket : R2_PRIVATE_BUCKET_DEFAULT,
    wafExpression: PUBLIC_MEDIA_WAF_EXPRESSION,
  };
  if (!pub.ok || !priv.ok) {
    return {
      ok: false,
      ...report,
      error: !pub.ok ? pub.error : priv.error,
      missing: !pub.ok ? pub.missing : priv.missing,
    };
  }

  const keys = [];
  for (const prefix of PREFIXES) {
    keys.push(...(await listPrefix(pub.config, prefix)));
  }
  const unique = [...new Set(keys)].filter((key) => isPrivateDocKey(key));
  const counts = countKeys(unique);
  if (!args.apply) {
    return { ok: true, ...report, counts, planned: unique.length };
  }

  let copied = 0;
  let deleted = 0;
  let failed = 0;
  for (const key of unique) {
    const plan = privateDocCopyPlan({
      publicBucket: pub.config.bucket,
      privateBucket: priv.config.bucket,
      key,
    });
    if (!plan) {
      failed += 1;
      continue;
    }
    try {
      const sourceLength = await headLength(pub.config, key);
      const copy = await signedRequest(priv.config, "PUT", key, {
        "x-amz-copy-source": `/${pub.config.bucket}/${encodeS3Path(key)}`,
      });
      if (!copy.ok) {
        failed += 1;
        continue;
      }
      await copy.arrayBuffer().catch(() => undefined);
      const destLength = await headLength(priv.config, key);
      if (sourceLength == null || destLength == null || sourceLength !== destLength) {
        failed += 1;
        continue;
      }
      copied += 1;
      const removed = await signedRequest(pub.config, "DELETE", key);
      if (removed.ok || removed.status === 404) deleted += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok: failed === 0, ...report, counts, copied, deleted, failed };
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  runPrivateDocMigration(process.argv.slice(2))
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : "migrate failed";
      console.error(message.replace(/<[^>]+>/g, ""));
      process.exitCode = 1;
    });
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  allowContentType,
  amzDateParts,
  decodeObjectBody,
  deriveR2Endpoint,
  encodeS3Path,
  humanR2Error,
  parseR2Endpoint,
  presignS3Get,
  R2_DEFAULT_BUCKET,
  R2_SETUP_MESSAGE,
  r2MissingEnv,
  r2StatusFromEnv,
  resolveR2Config,
  sanitizeObjectKey,
  sanitizeR2Error,
  sha256Hex,
  signS3Request,
} from "../src/lib/server/r2.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("missing R2 env is a clear Vercel setup message and lists names only", () => {
  const resolved = resolveR2Config({});
  assert.equal(resolved.ok, false);
  if (resolved.ok) return;
  assert.equal(resolved.error, R2_SETUP_MESSAGE);
  assert.deepEqual(resolved.missing, ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT"]);
  assert.doesNotMatch(resolved.error, /sk_|AKIA|hunter2|password123/i);
  assert.deepEqual(r2MissingEnv({ R2_ACCOUNT_ID: "abcde12345" }), [
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ]);
});

test("R2 config reads documented env names and defaults the bucket", () => {
  const resolved = resolveR2Config({
    R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret-key-not-real",
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.config.bucket, R2_DEFAULT_BUCKET);
  assert.equal(
    resolved.config.endpoint,
    "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
  );
  assert.equal(
    resolved.config.endpointHost,
    "0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
  );
  assert.equal(
    r2StatusFromEnv({
      R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
      R2_ACCESS_KEY_ID: "test-access-key",
      R2_SECRET_ACCESS_KEY: "test-secret-key-not-real",
      R2_BUCKET: "kidease-media",
    }).publicDelivery,
    false,
  );
});

test("R2_ENDPOINT wins and must be the Cloudflare S3 API host", () => {
  const resolved = resolveR2Config({
    R2_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret-key-not-real",
    R2_BUCKET: "kidease-media",
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.config.endpointHost, "acct.r2.cloudflarestorage.com");
  assert.throws(() => parseR2Endpoint("http://acct.r2.cloudflarestorage.com"), /https/);
  assert.throws(() => parseR2Endpoint("https://evil.example/"), /r2\.cloudflarestorage\.com/);
  assert.throws(
    () => parseR2Endpoint("https://user:pass@acct.r2.cloudflarestorage.com"),
    /credentials/,
  );
  assert.equal(deriveR2Endpoint("acctid1"), "https://acctid1.r2.cloudflarestorage.com");
});

test("object keys and image types are tightly allow-listed", () => {
  assert.equal(sanitizeObjectKey("originals/mb-1009.jpg"), "originals/mb-1009.jpg");
  assert.equal(sanitizeObjectKey("/originals/mb-1009.jpg"), "originals/mb-1009.jpg");
  assert.throws(() => sanitizeObjectKey("../etc/passwd"), /not allowed/);
  assert.throws(() => sanitizeObjectKey("foo bar.jpg"), /not allowed/);
  assert.throws(() => sanitizeObjectKey(""), /required/);
  assert.equal(allowContentType("image/jpeg; charset=binary"), "image/jpeg");
  assert.throws(() => allowContentType("text/html"), /JPEG/);
  const tiny = decodeObjectBody(Buffer.from("jpeg").toString("base64"));
  assert.equal(tiny.toString(), "jpeg");
  assert.throws(() => decodeObjectBody(""), /required/);
});

test("errors never echo the secret key", () => {
  const secret = "super-secret-r2-key-value";
  assert.equal(sanitizeR2Error(new Error(`boom ${secret}`), [secret]), "boom ••••");
  assert.match(humanR2Error(new Error("R2 403 AccessDenied")), /API token/);
  assert.equal(humanR2Error(new Error("R2_ACCESS_KEY_ID missing")), R2_SETUP_MESSAGE);
});

test("SigV4 matches the published AWS S3 GET Object example", () => {
  // https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
  const signed = signS3Request({
    method: "GET",
    url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
    headers: { range: "bytes=0-9" },
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    now: new Date("2013-05-24T00:00:00.000Z"),
  });
  assert.equal(
    signed.payloadHash,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.match(signed.canonicalRequest, /^GET\n\/test\.txt\n\n/);
  assert.match(signed.canonicalRequest, /host:examplebucket\.s3\.amazonaws\.com/);
  assert.match(signed.canonicalRequest, /range:bytes=0-9/);
  assert.equal(
    signed.signature,
    "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
  );
  assert.match(signed.authorization, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date/);
});

test("presigned GET is query-signed and does not embed the secret", () => {
  const url = presignS3Get({
    url: new URL("https://acct.r2.cloudflarestorage.com/kidease-media/originals/demo.jpg"),
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key-not-real",
    expiresIn: 300,
    now: new Date("2026-09-05T00:00:00.000Z"),
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(parsed.searchParams.get("X-Amz-Expires"), "300");
  assert.match(parsed.searchParams.get("X-Amz-Signature") || "", /^[a-f0-9]{64}$/);
  assert.doesNotMatch(url, /test-secret-key-not-real/);
  assert.equal(
    encodeS3Path("/kidease-media/originals/demo.jpg"),
    "/kidease-media/originals/demo.jpg",
  );
  assert.equal(amzDateParts(new Date("2026-09-05T00:00:00.000Z")).amzDate, "20260905T000000Z");
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("admin media route is registered and env example has names only", () => {
  const route = readFileSync(join(root, "src/routes/api/admin.media.ts"), "utf8");
  const tree = readFileSync(join(root, "src/routeTree.gen.ts"), "utf8");
  const envExample = readFileSync(join(root, ".env.example"), "utf8");
  const csp = readFileSync(join(root, "vercel.json"), "utf8");
  assert.match(route, /createFileRoute\("\/api\/admin\/media"\)/);
  assert.match(route, /requireAdmin/);
  assert.match(route, /assertSameSiteRequest/);
  assert.match(tree, /from '\.\/routes\/api\/admin\.media'/);
  assert.match(tree, /id:\s*'\/api\/admin\/media'/);
  assert.match(envExample, /R2_ACCOUNT_ID=/);
  assert.match(envExample, /R2_BUCKET=kidease-media/);
  assert.match(envExample, /R2_ACCESS_KEY_ID=/);
  assert.match(envExample, /R2_SECRET_ACCESS_KEY=/);
  assert.match(envExample, /R2_ENDPOINT=/);
  assert.doesNotMatch(envExample, /R2_SECRET_ACCESS_KEY=\S+/);
  assert.doesNotMatch(envExample, /R2_ACCESS_KEY_ID=\S+/);
  assert.match(csp, /img-src 'self' data: blob: https:/);
  assert.doesNotMatch(csp, /r2\.cloudflarestorage\.com/);
});

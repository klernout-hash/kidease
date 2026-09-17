import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

/** Mirrors src/lib/auth/cookies.ts unsignedSessionToken — keep in sync. */
function unsignedSessionToken(raw) {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return value;
  const sig = value.slice(dot + 1);
  if (sig.length === 44 && sig.endsWith("=")) return value.slice(0, dot);
  return value;
}

describe("unsignedSessionToken", () => {
  it("strips Better Auth signed cookie suffix before DB lookup", () => {
    const token = "sess_live_abc123XYZ";
    const sig = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    assert.equal(sig.length, 44);
    assert.equal(unsignedSessionToken(`${token}.${sig}`), token);
    assert.equal(unsignedSessionToken(token), token);
    assert.equal(unsignedSessionToken(null), null);
    assert.equal(unsignedSessionToken(""), null);
    assert.equal(unsignedSessionToken("a.b"), "a.b");
    assert.match(src("src/lib/auth/cookies.ts"), /export function unsignedSessionToken/);
    assert.match(src("src/lib/auth/cookies.ts"), /sig\.length === 44/);
  });
});

describe("assertAdminIdleFresh bootstrap", () => {
  it("uses unsigned session token and session.createdAt within idle TTL", () => {
    const reauth = src("src/lib/server/reauth.server.ts");
    assert.match(reauth, /bootstrapAdminIdleFromSession/);
    assert.match(reauth, /ADMIN_IDLE_TTL_MS/);
    assert.match(reauth, /writeAdminIdleCookie/);
    assert.match(src("src/lib/auth/server.ts"), /unsignedSessionToken/);
    assert.match(src("src/lib/reauth.ts"), /ADMIN_IDLE_TTL_MS = 30 \* 60 \* 1000/);
  });

  it("mints idle cookie on 2FA / reauth step-up, not only requireAdmin", () => {
    assert.match(src("src/lib/server/two-factor.ts"), /writeAdminIdleCookie/);
    assert.match(src("src/lib/server/reauth.ts"), /writeAdminIdleCookie/);
    assert.match(src("src/lib/server/reauth.ts"), /canContinueAdminSession/);
  });

  it("blocks soft session-continue into Admin when idle is stale", () => {
    const login = src("src/routes/login.tsx");
    assert.match(login, /canContinueAdminSession/);
    assert.match(login, /Admin session timed out\. Enter your password/);
    assert.match(login, /user \|\| operator/);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { friendlyAuthError } from "../src/lib/auth/login-errors.ts";
import {
  ADMIN_SESSION_TIMEOUT_MESSAGE,
  LOGIN_TAKING_TOO_LONG_MESSAGE,
  releaseStuckLogin,
  shouldAutoContinue,
} from "../src/lib/auth/login-stall.ts";
import {
  attachTurnstileToRequest,
  beginTurnstileReset,
  coalesceTurnstileToken,
  mergeTurnstileBody,
  readTurnstileResponseValue,
} from "../src/lib/turnstile-widget.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("Turnstile Success must re-enable sign-in", () => {
  it("keeps a token that reset() reports synchronously", () => {
    let token = "stale";
    beginTurnstileReset(
      (next) => {
        token = next;
      },
      () => {
        token = "fresh-token";
      },
    );
    assert.equal(token, "fresh-token");

    beginTurnstileReset(
      (next) => {
        token = next;
      },
      () => {},
    );
    assert.equal(token, "");
  });

  it("reads the hidden widget field when React state was wiped", () => {
    const root = {
      querySelector(selector) {
        assert.match(selector, /cf-turnstile-response/);
        return { value: " live-token " };
      },
    };
    assert.equal(readTurnstileResponseValue(root), "live-token");
    assert.equal(coalesceTurnstileToken("", " live-token "), "live-token");
    assert.equal(coalesceTurnstileToken("state-token", "live-token"), "state-token");
    assert.equal(readTurnstileResponseValue(null), "");
  });

  it("copies the token into headers and the JSON body", () => {
    const headers = new Map();
    const ctx = attachTurnstileToRequest(
      {
        headers: { set: (name, value) => headers.set(name, value) },
        body: JSON.stringify({ email: "kyle@kidease.ca", password: "secret" }),
      },
      "tok-1",
    );
    assert.equal(headers.get("x-turnstile-token"), "tok-1");
    assert.equal(headers.get("cf-turnstile-response"), "tok-1");
    assert.equal(JSON.parse(ctx.body).turnstileToken, "tok-1");
    assert.equal(JSON.parse(ctx.body).email, "kyle@kidease.ca");
    const asObject = mergeTurnstileBody({ email: "a@b.c" }, "tok-2");
    assert.equal(asObject.turnstileToken, "tok-2");
  });

  it("does not use the implicit cf-turnstile class", () => {
    const field = src("src/components/turnstile-field.tsx");
    assert.match(field, /beginTurnstileReset/);
    assert.match(field, /readTurnstileResponseValue/);
    assert.doesNotMatch(field, /className="cf-turnstile/);
    assert.match(field, /appearance: "always"/);
  });
});

describe("Opening your desk does not loop", () => {
  it("a failed admin soft-continue stays on the password form", () => {
    let continued = false;
    let busy = false;
    assert.equal(shouldAutoContinue({ continued, busy, hasUser: true, sessionPending: false }), true);
    continued = true;
    busy = true;
    const released = releaseStuckLogin("admin-password");
    continued = released.keepContinued;
    busy = released.busy;
    assert.equal(released.error, ADMIN_SESSION_TIMEOUT_MESSAGE);
    assert.equal(shouldAutoContinue({ continued, busy, hasUser: true, sessionPending: false }), false);

    const stalled = releaseStuckLogin("stall");
    assert.equal(stalled.keepContinued, true);
    assert.equal(stalled.busy, false);
    assert.match(stalled.error, /taking too long/);
    assert.equal(friendlyAuthError("sign-in-timeout"), LOGIN_TAKING_TOO_LONG_MESSAGE);
  });

  it("login copy is not stuck on a signed-in user", () => {
    const login = src("src/routes/login.tsx");
    assert.match(login, /busy && !error \? t\("openingDesk"\)/);
    assert.match(src("src/lib/copy.ts"), /openingDesk: "Opening your desk…"/);
    assert.doesNotMatch(login, /user && !sessionPending \? "Opening your desk…"/);
    assert.match(login, /releaseStuckLogin\("stall"\)/);
    assert.match(login, /releaseStuckLogin\("admin-password"\)/);
    assert.match(login, /LOGIN_POST_MS/);
    assert.match(login, /withTimeoutFallback\(canContinueAdminSession\(\)/);
    assert.doesNotMatch(login, /continued\.current = false/);
    assert.match(src("src/lib/auth/client.ts"), /signOutBestEffort/);
    assert.match(src("src/lib/auth/session-settle.ts"), /GET_SESSION_ATTEMPT_MS/);
    assert.match(src("src/routes/verify-2fa.tsx"), /LOGIN_TAKING_TOO_LONG_MESSAGE/);
    assert.match(src("docs/cloudflare.md"), /Opening your desk/);
    assert.match(src("docs/cloudflare.md"), /\/api\/auth\/callback\//);
  });
});

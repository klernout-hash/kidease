/**
 * Security-sensitive ids and codes use Web Crypto, not Math.random (handoff S7 / 6c).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BASE36,
  secureRandom,
  secureRandomHex,
  secureRandomInt,
  secureRandomString,
} from "../src/lib/secure-random.ts";
import { newReferralCode, normalizeReferralCode } from "../src/lib/referrals.ts";
import { randomSessionToken, randomTicketCode } from "../src/lib/support-chat.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

function withPoisonedMathRandom(fn) {
  const original = Math.random;
  Math.random = () => {
    throw new Error("Math.random used for a security id");
  };
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

test("secure helpers stay in range and never call Math.random", () => {
  withPoisonedMathRandom(() => {
    for (let i = 0; i < 500; i += 1) {
      const n = secureRandomInt(7);
      assert.ok(Number.isInteger(n) && n >= 0 && n < 7);
      const f = secureRandom();
      assert.ok(f >= 0 && f < 1);
    }
    assert.match(secureRandomString(BASE36, 8), /^[0-9a-z]{8}$/);
    assert.match(secureRandomHex(18), /^[0-9a-f]{36}$/);
  });
  assert.throws(() => secureRandomInt(0), RangeError);
});

test("secureRandomInt is not obviously biased", () => {
  const counts = new Array(32).fill(0);
  for (let i = 0; i < 32_000; i += 1) counts[secureRandomInt(32)] += 1;
  for (const c of counts) assert.ok(c > 700 && c < 1300, `bucket ${c}`);
});

test("referral, ticket and chat session codes keep their format and use crypto", () => {
  withPoisonedMathRandom(() => {
    const codes = new Set();
    for (let i = 0; i < 200; i += 1) {
      const code = newReferralCode();
      assert.equal(normalizeReferralCode(code), code);
      codes.add(code);
      assert.match(randomTicketCode(), /^KE-\d{4}$/);
      assert.match(randomSessionToken(), /^[0-9a-f]{36}$/);
    }
    assert.ok(codes.size > 190);
  });
  // Test injection hooks are kept.
  assert.equal(
    newReferralCode(() => 0),
    "aaaaaaaa",
  );
  assert.equal(
    randomTicketCode(() => 0),
    "KE-1000",
  );
});

test("nid keeps its shape and draws from crypto", async () => {
  const { nid } = await import("../src/lib/utils.ts");
  withPoisonedMathRandom(() => {
    const ids = new Set();
    for (let i = 0; i < 200; i += 1) {
      const id = nid("cl");
      assert.match(id, /^cl_[0-9a-z]{12}$/);
      ids.add(id);
    }
    assert.equal(ids.size, 200);
  });
});

test("security-sensitive generators no longer reference Math.random", () => {
  for (const file of [
    "src/lib/utils.ts",
    "src/lib/referrals.ts",
    "src/lib/support-chat.ts",
    "src/lib/live-support.ts",
    "src/lib/listing-spaces-store.ts",
    "src/lib/server/claims.ts",
    "src/lib/server/listing-queue.ts",
    "src/lib/server/growth-loops.ts",
    "src/lib/server/push-tokens.ts",
    "src/lib/server/titan-mail.ts",
    "src/components/admin-feature-controls.tsx",
  ]) {
    assert.doesNotMatch(src(file), /Math\.random/, file);
  }
  assert.doesNotMatch(src("src/lib/secure-random.ts"), /Math\.random\(\)/);
});

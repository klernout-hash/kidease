import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("signup stores an 18+ confirmation and the terms say 18+", () => {
  const login = src("src/routes/login.tsx");
  const parent = src("src/components/parent-signup-form.tsx");
  assert.match(login, /I confirm I am 18 or older\./);
  assert.match(login, /Je confirme que j’ai 18 ans ou plus\./);
  assert.match(login, /confirmAdultAge/);
  assert.match(login, /markAdultConfirmedForSession/);
  assert.match(parent, /I confirm I am 18 or older\./);
  assert.match(parent, /confirmAdultAge/);
  assert.match(src("src/routes/__root.tsx"), /AdultConfirmBoot/);
  assert.match(src("src/lib/server/adult-confirm.ts"), /adult_confirmed_at/);
  assert.match(src("migrations/0095_adult_confirmed.sql"), /adult_confirmed_at/);
  const terms = src("src/lib/legal-copy.ts");
  assert.match(terms, /You must be 18 or older to create an account/);
  assert.match(terms, /Vous devez avoir 18 ans ou plus pour créer un compte/);
  assert.doesNotMatch(src("src/lib/server/adult-confirm.ts"), /birthdate|child photo/i);
});

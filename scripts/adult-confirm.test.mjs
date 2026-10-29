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
  const notice = src("src/components/continue-age-notice.tsx");
  assert.match(notice, /By continuing, you confirm you're 18 or older and agree to the /);
  assert.match(notice, /En continuant, vous confirmez avoir 18 ans ou plus/);
  assert.match(notice, /Privacy Policy/);
  assert.match(notice, /Politique de confidentialité/);
  assert.match(notice, /localePath\("\/terms"/);
  assert.match(notice, /localePath\("\/privacy"/);
  assert.doesNotMatch(notice, /type="checkbox"/);
  assert.match(login, /ContinueAgeNotice/);
  assert.match(login, /confirmAdultAge/);
  assert.match(login, /markAdultConfirmedForSession/);
  assert.doesNotMatch(login, /signup-adult|signin-adult|I confirm I am 18 or older/);
  assert.match(parent, /ContinueAgeNotice/);
  assert.match(parent, /confirmAdultAge/);
  assert.match(parent, /markAdultConfirmedForSession/);
  assert.doesNotMatch(parent, /parent-signup-adult|I confirm I am 18 or older/);
  assert.match(src("src/routes/__root.tsx"), /AdultConfirmBoot/);
  assert.match(src("src/lib/server/adult-confirm.ts"), /adult_confirmed_at/);
  assert.match(src("migrations/0095_adult_confirmed.sql"), /adult_confirmed_at/);
  const terms = src("src/lib/legal-copy.ts");
  assert.match(terms, /You must be 18 or older to create an account/);
  assert.match(terms, /Vous devez avoir 18 ans ou plus pour créer un compte/);
  assert.doesNotMatch(src("src/lib/server/adult-confirm.ts"), /birthdate|child photo/i);
});

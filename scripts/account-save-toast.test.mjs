import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function onSaveBody() {
  const account = src("src/routes/account.tsx");
  const start = account.indexOf("async function onSave(");
  const end = account.indexOf("const backCopy =", start);
  assert.ok(start > 0 && end > start, "onSave is in account.tsx");
  return account.slice(start, end);
}

test("the success toast shows right after saveMyContact resolves", () => {
  const body = onSaveBody();
  const contact = body.indexOf("await saveMyContact(");
  const success = body.indexOf('toast.success(t("successProfileSaved"))');
  const confirm = body.indexOf('confirmAction(t, "profileSaved")');
  const consents = body.indexOf("await saveMyCaslConsents(");
  const anchors = body.indexOf("await saveMySearchAnchors(");
  assert.ok(contact > 0 && success > contact, "toast after the contact save");
  assert.ok(confirm > contact && confirm < consents, "confirm card before the consent save");
  assert.ok(success < consents, "toast before the consent save");
  assert.ok(success < anchors, "toast before the address save");
  assert.match(body, /setSaveOk\(true\)/);
});

test("consent and address failures are non-fatal, with their own warning", () => {
  const body = onSaveBody();
  assert.match(
    body,
    /try \{\s*const nextConsent = await saveMyCaslConsents\([\s\S]*?\} catch \{\s*toast\.warning\(t\("accountConsentSaveFailed"\)\);\s*\}/,
  );
  assert.match(
    body,
    /try \{\s*await saveMySearchAnchors\([\s\S]*?\} catch \{\s*toast\.warning\(t\("accountAnchorSaveFailed"\)\);\s*\}/,
  );
  // The contact save failure is still the only path to the generic error.
  assert.match(body, /toast\.error\(err instanceof Error \? err\.message : t\("accountSaveFailed"\)\)/);
});

test("both account forms have a polite Saved live region", () => {
  const account = src("src/routes/account.tsx");
  const regions = account.match(/role="status" aria-live="polite" data-ke="account-save-ok"/g) ?? [];
  assert.equal(regions.length, 2);
  assert.match(account, /saveOk && !saving \? t\("accountSavedStatus"\) : ""/);
});

test("new account save strings exist in English and French Canadian", () => {
  const en = src("src/lib/copy-en.ts");
  const fr = src("src/lib/copy-fr.ts");
  for (const key of ["accountSavedStatus", "accountConsentSaveFailed", "accountAnchorSaveFailed"]) {
    assert.match(en, new RegExp(`\\b${key}: "`));
    assert.match(fr, new RegExp(`\\b${key}: "`));
  }
  assert.match(fr, /accountSavedStatus: "Enregistré"/);
});

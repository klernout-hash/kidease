import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("org #37: the step-up dialog portals out of the page form and stops its submit there", () => {
  const dialog = src("src/components/reauth-dialog.tsx");
  assert.match(dialog, /import \{ createPortal \} from "react-dom";/);
  assert.match(dialog, /createPortal\(body, document\.body\)/);
  const stops = dialog.match(/e\.preventDefault\(\);\s+(\/\/[^\n]*\n\s+)*e\.stopPropagation\(\);/g) || [];
  assert.equal(stops.length, 2, "password and code submits both stop propagation");
  // The child form still renders the dialog and retries the save after confirm.
  assert.match(src("src/components/child-profile-form.tsx"), /\{reauth\.dialog\}/);
  assert.match(dialog, /const ok = await prompt\(\);\s+if \(!ok\) throw new Error\(REAUTH_REQUIRED_MESSAGE\);\s+return action\(\);/);
});

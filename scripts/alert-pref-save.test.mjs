import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { alertPrefsToWrite, alertShownOn } from "../src/lib/alert-pref-save.ts";
import { alertsForAudience } from "../src/lib/unified-alerts.ts";

const root = new URL("../", import.meta.url);

test("visible parent alerts are the live and partial types, not hidden hooks", () => {
  assert.equal(alertsForAudience("parent").length, 10);
  assert.equal(alertsForAudience("parent", true).length, 15);
});

test("opening alerts does not write unknown rows, and a real off is stored", () => {
  assert.equal(alertShownOn({}, "parent_new_message"), true);
  assert.equal(alertShownOn({ parent_new_message: false }, "parent_new_message"), false);
  assert.equal(alertShownOn({ parent_new_message: true }, "parent_new_message"), true);
  assert.deepEqual(alertPrefsToWrite({}, []), []);
  assert.deepEqual(alertPrefsToWrite({ parent_new_message: false }, ["parent_new_message"]), [
    { typeId: "parent_new_message", enabled: false },
  ]);
  const panel = readFileSync(new URL("src/components/unified-alert-panel.tsx", root), "utf8");
  const load = panel.slice(panel.indexOf("void loadUnifiedAlertDesk"), panel.indexOf("}, [copy.error, native]"));
  assert.doesNotMatch(load, /saveUnifiedAlertDesk/);
  assert.match(panel, /alertPrefsToWrite\(prefs, touched\)/);
});

test("facility rows are checkboxes, and safety chips stay chips", () => {
  const picker = readFileSync(new URL("src/components/daycare-facilities-picker.tsx", root), "utf8");
  assert.match(picker, /CheckRow/);
  assert.match(readFileSync(new URL("src/components/switch-row.tsx", root), "utf8"), /type="checkbox"/);
  const css = readFileSync(new URL("src/styles.css", root), "utf8");
  assert.match(css, /\.ke-check::before[\s\S]*border-radius: 999px/);
  assert.match(css, /M12 6v12M6 12h12/);
  assert.match(css, /ke-check:checked::after[\s\S]*M5 12\.5 10 17\.5 19 7/);
  assert.match(readFileSync(new URL("src/components/switch-row.tsx", root), "utf8"), /Ajouter/);
  assert.doesNotMatch(readFileSync(new URL("src/components/casl-consent-fields.tsx", root), "utf8"), /ke-check/);
  assert.doesNotMatch(picker, /data-ke="facility-row"[\s\S]{0,200}<button/);
  const fields = readFileSync(new URL("src/components/provider-parent-fields.tsx", root), "utf8");
  assert.match(fields, /SAFETY_FEATURES\.map/);
  assert.match(fields, /ChipButton/);
});

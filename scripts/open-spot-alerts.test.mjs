import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { eventsForOpenSpotMail } from "../src/lib/open-spot-alerts.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("open-spot email stays off until the flag is on", () => {
  const events = [
    { kind: "new_centre", id: "a" },
    { kind: "vacancy_reconfirmed", id: "b" },
  ];
  assert.deepEqual(
    eventsForOpenSpotMail(events, false).map((event) => event.kind),
    ["new_centre"],
  );
  assert.equal(eventsForOpenSpotMail(events, true).length, 2);
  const flags = readFileSync(join(root, "src/lib/flags.ts"), "utf8");
  assert.match(flags, /FEATURE_OPEN_SPOT_ALERTS: false/);
  const alerts = readFileSync(join(root, "src/lib/server/search-alerts.ts"), "utf8");
  const gate = alerts.indexOf("const spotMail = openSpotAlertsEnabled()");
  const mail = alerts.indexOf("sendSearchAlertEmail");
  assert.ok(gate >= 0);
  assert.ok(mail > gate);
  assert.match(alerts, /eventsForOpenSpotMail\(events, spotMail\)/);
  assert.match(alerts, /if \(!spotMail && row\.kind === "vacancy_reconfirmed"\) continue/);
});

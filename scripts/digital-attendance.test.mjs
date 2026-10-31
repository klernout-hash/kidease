import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { doorCopy, doorStatus, todayYmd } from "../src/lib/attendance-door.ts";
import { digitalAttendanceEnabled } from "../src/lib/features.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("door check-in defaults off and does not take a photo", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_DIGITAL_ATTENDANCE, false);
  assert.equal(digitalAttendanceEnabled({}), false);
  assert.equal(digitalAttendanceEnabled({ FEATURE_DIGITAL_ATTENDANCE: "1" }), true);
  assert.equal(doorStatus("check_in"), "arrived");
  assert.equal(doorStatus("check_out"), "departed");
  assert.match(todayYmd(new Date("2026-10-31T15:00:00.000Z")), /^2026-10-31$/);
  assert.match(doorCopy("en").lead, /does not take a photo/);
  assert.match(doorCopy("fr").help, /Aide/);
  const page = read("src/routes/checkin.$id.tsx");
  assert.match(page, /digitalAttendanceFlag/);
  assert.match(page, /data-ke="door-checkin"/);
  assert.match(page, /saveAttendance/);
  assert.match(page, /localePath\("\/help"/);
  assert.match(page, /getUserMedia/);
  assert.match(page, /function CameraCheckIn/);
  assert.match(page, /function DoorCheckIn/);
  const door = page.slice(page.indexOf("function DoorCheckIn"), page.indexOf("function CameraCheckIn"));
  assert.doesNotMatch(door, /getUserMedia|<img|<video/);
  assert.match(read(".env.example"), /^FEATURE_DIGITAL_ATTENDANCE=0$/m);
  assert.doesNotMatch(read("src/lib/server/attendance-flag.ts"), /stripe|sms/i);
});

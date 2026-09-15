import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { centreCanWriteCare, centreCanWriteInbox } from "../src/lib/centre-roles.ts";
import {
  ATTENDANCE_STATUSES,
  attendanceFromAction,
  canOpenCareThread,
  canMarkAttendance,
  careStatusBody,
  centreCanMessageParent,
  isEnrolledBookingStatus,
  isJournalImageType,
  journalPhotoDecision,
  journalPostReady,
  JOURNAL_MAX_PHOTOS,
  normalizeJournalBody,
  parentCanMessageCentre,
  parseJournalPhotos,
  presenceFromAttendance,
} from "../src/lib/daily-care.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { inAppChatEnabled } from "../src/lib/features.ts";
import { parentNavSearch, visibleDeskNav } from "../src/lib/desk-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("FEATURE_INAPP_CHAT stays off; live parent ↔ centre chat is /inbox", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_INAPP_CHAT, false);
  assert.equal(inAppChatEnabled({}), false);
  assert.equal(inAppChatEnabled({ FEATURE_INAPP_CHAT: "0" }), false);
  const bot = src("src/components/help-bot.tsx");
  assert.match(bot, /if \(!inAppChatEnabled\(\)\) return null/);
  const inbox = src("src/lib/server/inbox.ts");
  assert.match(inbox, /export const sendConnectedMessage/);
  assert.match(inbox, /requireConversationWrite/);
  assert.doesNotMatch(inbox, /inAppChatEnabled/);
  const envExample = src(".env.example");
  assert.match(envExample, /^FEATURE_INAPP_CHAT=0$/m);
  assert.match(src("docs/chat.md"), /FEATURE_INAPP_CHAT/);
  assert.match(src("docs/chat.md"), /\/inbox/);
});

test("messaging is allowed only for inquiry threads or enrolled links", () => {
  assert.equal(parentCanMessageCentre({ hasConversation: true, enrolled: false }), true);
  assert.equal(parentCanMessageCentre({ hasConversation: false, enrolled: true }), true);
  assert.equal(parentCanMessageCentre({ hasConversation: false, enrolled: false }), false);
  assert.equal(centreCanMessageParent({ claimedOrStaff: true, hasConversation: true }), true);
  assert.equal(centreCanMessageParent({ claimedOrStaff: true, hasConversation: false }), false);
  assert.equal(centreCanMessageParent({ claimedOrStaff: false, hasConversation: true }), false);
  assert.equal(canOpenCareThread({ enrolled: true, hasConversation: false }), true);
  assert.equal(canOpenCareThread({ enrolled: false, hasConversation: true }), true);
  assert.equal(canOpenCareThread({ enrolled: false, hasConversation: false }), false);
  assert.equal(isEnrolledBookingStatus("accepted"), true);
  assert.equal(isEnrolledBookingStatus("active"), true);
  assert.equal(isEnrolledBookingStatus("requested"), false);
});

test("check-in/out maps to presence parents can see", () => {
  assert.deepEqual([...ATTENDANCE_STATUSES], ["scheduled", "arrived", "departed", "absent"]);
  assert.equal(presenceFromAttendance("arrived"), "here");
  assert.equal(presenceFromAttendance("departed"), "picked_up");
  assert.equal(presenceFromAttendance("absent"), "absent");
  assert.equal(presenceFromAttendance("scheduled"), "expected");
  assert.equal(attendanceFromAction("check_in"), "arrived");
  assert.equal(attendanceFromAction("check_out"), "departed");
  assert.equal(attendanceFromAction("absent"), "absent");
  assert.equal(canMarkAttendance("parent"), true);
  assert.equal(canMarkAttendance("provider"), true);
  assert.equal(canMarkAttendance("read_only"), false);
  assert.equal(centreCanWriteCare("staff"), true);
  assert.equal(centreCanWriteCare("read_only"), false);
  assert.equal(centreCanWriteCare("staff"), centreCanWriteInbox("staff"));
  assert.match(careStatusBody({ kind: "check_in", childName: "Ada", daycareName: "Bonnie" }), /Ada checked in/);
  assert.match(careStatusBody({ kind: "journal", childName: "Ada", daycareName: "Bonnie", locale: "fr" }), /journal du jour/);
});

test("journal accepts text + photos and refuses video", () => {
  assert.equal(JOURNAL_MAX_PHOTOS, 4);
  assert.equal(isJournalImageType("image/jpeg"), true);
  assert.equal(isJournalImageType("video/mp4"), false);
  assert.equal(journalPhotoDecision({ type: "video/mp4", size: 1000 }), "video");
  assert.equal(journalPhotoDecision({ type: "image/png", size: 1000 }), "ok");
  assert.equal(journalPhotoDecision({ type: "image/png", size: 9_000_000 }), "size");
  const photos = parseJournalPhotos([{ src: "data:image/png;base64,aaa", name: "n.png" }]);
  assert.equal(photos.length, 1);
  assert.equal(parseJournalPhotos([{ src: "data:video/mp4;base64,aaa" }]).length, 0);
  assert.equal(journalPostReady({ body: "Snack time", photos: [] }), true);
  assert.equal(journalPostReady({ body: "", photos }), true);
  assert.equal(journalPostReady({ body: "", photos: [] }), false);
  assert.equal(normalizeJournalBody("  hello   ").length > 0, true);
});

test("Daily care is wired on parent desk and daycare Today without touching marketplace helpers", () => {
  assert.equal(parentNavSearch("care").tab, "care");
  assert.equal(visibleDeskNav("parent").some((item) => item.id === "care"), true);
  assert.match(src("src/components/parent-desk.tsx"), /DailyCareDesk/);
  assert.match(src("src/components/parent-desk.tsx"), /contentTab === "care"/);
  assert.match(src("src/routes/parent.tsx"), /tab === "care"/);
  assert.match(src("src/components/today-urgency-home.tsx"), /DailyCareDesk role="provider"/);
  assert.match(src("src/components/daily-care-desk.tsx"), /data-ke="daily-care"/);
  assert.match(src("src/components/daily-care-desk.tsx"), /saveAttendance/);
  assert.match(src("src/components/daily-care-desk.tsx"), /postDailyJournal/);
  assert.match(src("src/components/daily-care-desk.tsx"), /sendConnectedMessage/);
  assert.match(src("src/components/daily-care-desk.tsx"), /listCareOps/);
  assert.match(src("src/components/daily-care-desk.tsx"), /CareOpsPanel/);
  assert.match(src("src/components/daily-care-desk.tsx"), /CareChildOps/);
  assert.match(src("src/components/daily-care-desk.tsx"), /accept="image\/jpeg,image\/png,image\/webp,image\/gif"/);
  assert.match(src("src/components/daily-care-desk.tsx"), /carePhotoTooBig/);
  assert.match(src("src/components/daily-care-desk.tsx"), /UploadLimitHint/);
  assert.doesNotMatch(src("src/components/daily-care-desk.tsx"), /video\/mp4|FEATURE_VIDEO/);
  const helpers = src("src/lib/now-loops.ts");
  const care = src("src/lib/daily-care.ts");
  assert.doesNotMatch(helpers, /daily-care|FEATURE_INAPP_CHAT|saveAttendance/);
  assert.doesNotMatch(care, /now-loops|location-lock|isLiveLookingCard|honestVacancy/);
  assert.match(src("migrations/0012_attendance.sql"), /create table if not exists attendance/);
  assert.match(src("migrations/0050_daily_journals.sql"), /create table if not exists daily_journals/);
  assert.match(src("migrations/0050_daily_journals.sql"), /photos jsonb/);
  assert.doesNotMatch(src("migrations/0050_daily_journals.sql"), /bytea|video_url|mp4/);
  assert.match(src("src/lib/server/ops.ts"), /centreCanWriteCare/);
  assert.match(src("src/lib/server/ops.ts"), /insertCareStatusMessage/);
  assert.match(src("src/lib/copy.ts"), /dailyCare: "Daily care"/);
  assert.match(src("src/lib/copy.ts"), /dailyCare: "Soins du jour"/);
  assert.match(src("src/lib/casl.ts"), /emailCommercial/);
  assert.doesNotMatch(src("src/lib/server/daily-care.ts"), /FEATURE_SMS|sendSms|emailCommercial/);
  assert.doesNotMatch(src("src/lib/server/care-ops.ts"), /FEATURE_SMS|sendSms|emailCommercial/);
});

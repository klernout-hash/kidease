import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  CALL_MATCH_BOOKING_STATUSES,
  CALL_MATCH_TOUR_STATUSES,
  CALL_NOT_MATCHED,
  callPairMatched,
  callMatchReason,
  shellBlocksCallMedia,
} from "../src/lib/call-match.ts";
import {
  MEDIA_RESERVE_SQL,
  SETTLE_VIDEO_PARTICIPANT_SQL,
  SETTLE_VIDEO_ROOM_SQL,
  SETTLE_VOICE_CALL_SQL,
  VOICE_CALL_TIME_LIMIT_SECONDS as MINUTES_LIMIT,
  billedMinutes,
  voiceCallMinutes,
} from "../src/lib/media-minutes.ts";
import {
  VOICE_CALL_TIME_LIMIT_SECONDS,
  capReachedTwiml,
  clientDialTwiml,
  dialActionTwiml,
  incomingVoiceTwiml,
  voiceIdentityForUser,
  voiceStatusCallbackUrl,
} from "../src/lib/voice.ts";
import { videoStatusCallbackUrl } from "../src/lib/server/video.ts";
import { CALL_MEDIA_PERMISSIONS, androidCallMediaRequested, applyCallAndPushPermissions } from "./patch-native-permissions.mjs";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ---------- matched pairs ----------

test("calls open only for an accepted request, tour, booking, or enrolment", () => {
  assert.equal(callPairMatched({}), false);
  assert.equal(callPairMatched({ bookingStatuses: ["under_review", "waitlist", "declined"] }), false);
  assert.equal(callPairMatched({ tourStatuses: ["pending", "declined", "lost", "expired"] }), false);
  for (const s of CALL_MATCH_BOOKING_STATUSES) assert.equal(callPairMatched({ bookingStatuses: [s] }), true, s);
  for (const s of CALL_MATCH_TOUR_STATUSES) assert.equal(callPairMatched({ tourStatuses: [s] }), true, s);
  assert.equal(callPairMatched({ enrolmentHandoff: true }), true);
  assert.equal(callPairMatched({ attendanceLink: true }), true);
  assert.equal(callMatchReason({}), null);
  assert.equal(CALL_NOT_MATCHED, "call_not_matched");
});

test("Android store apps hide calls until a build declares camera + mic", () => {
  const play = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 KidEaseNative";
  assert.equal(shellBlocksCallMedia(play), true);
  assert.equal(shellBlocksCallMedia(`${play} KidEaseStoreSamsung`), true);
  assert.equal(shellBlocksCallMedia(`${play} KidEaseCallMedia`), false);
  assert.equal(shellBlocksCallMedia("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) KidEaseNative"), false);
  assert.equal(shellBlocksCallMedia("Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile"), false);
  assert.equal(shellBlocksCallMedia(""), false);
});

test("server enforces matched pairs on every call path", () => {
  assert.match(src("src/lib/server/family.ts"), /pairCallMatched\(sql/);
  assert.match(src("src/lib/server/video-join.ts"), /reason: "not_matched"/);
  assert.match(src("src/lib/server/voice-call.ts"), /error: CALL_NOT_MATCHED/);
  assert.match(src("src/lib/server/voice-routing.ts"), /pairCallMatched\(sql, \{ parentUserId: parentId, daycareId, conversationId \}\)/);
  assert.match(src("src/lib/server/call-ring-fns.ts"), /error: "call_not_matched"/);
  const match = src("src/lib/server/call-match.ts");
  assert.match(match, /catch/);
});

// ---------- headers on both desks ----------

test("parent and daycare thread headers both carry Call, Video, Block, and Report", () => {
  const actions = src("src/components/thread-call-actions.tsx");
  assert.match(actions, /export function ThreadHeaderActions/);
  assert.match(actions, /<SafetyReportButton[^>]*variant="icon"/);
  assert.match(actions, /<BlockMessagesButton[^>]*variant="icon"/);
  assert.match(actions, /data-ke="thread-header-actions"/);
  for (const file of ["src/routes/inbox.$id.tsx", "src/components/centre-inbox.tsx"]) {
    const s = src(file);
    assert.match(s, /actions=\{[\s\S]{0,200}<ThreadHeaderActions/, file);
    assert.match(s, /matched=\{callsMatched\}/, file);
    assert.match(s, /<ThreadCallLockedNote/, file);
    assert.match(s, /videoJoinable=\{callsMatched && Boolean\(videoSurface\) && !callMediaBlocked\}/, file);
  }
});

// ---------- copy ----------

test("copy says Video call, in-app only, and no internal wording", () => {
  const en = src("src/lib/copy-en.ts");
  const fr = src("src/lib/copy-fr.ts");
  assert.match(en, /videoTourTitle: "Video call"/);
  assert.match(fr, /videoTourTitle: "Appel vidéo"/);
  assert.match(en, /callsInAppNote: "In-app call only\. No phone number is dialled\."/);
  assert.match(en, /callsUnavailable: "Calls aren’t available yet\. You can still send a message\."/);
  assert.match(fr, /callsUnavailable: "Les appels ne sont pas encore offerts/);
  assert.doesNotMatch(en, /mobile number stays hidden/);
  const call = src("src/routes/call.$conversationId.tsx");
  assert.match(call, /t\("callsInAppNote"\)/);
  assert.match(call, /t\("callsUnavailable"\)/);
  assert.match(call, /t\("callsNotMatched"\)/);
  assert.doesNotMatch(call, /voiceNoCredentials/);
  const video = src("src/routes/video.$roomId.tsx");
  assert.match(video, /t\("callsUnavailableApp"\)/);
  assert.match(video, /Boolean\(status\?\.subscriptionsOn\) &&/);
  assert.match(video, /title: "Video call · KidEase"/);
});

// ---------- voice TwiML ----------

test("in-app voice: 30-minute limit, action callback, and never a phone number", () => {
  assert.equal(VOICE_CALL_TIME_LIMIT_SECONDS, 1800);
  assert.equal(MINUTES_LIMIT, VOICE_CALL_TIME_LIMIT_SECONDS);
  const id = voiceIdentityForUser("user_abc");
  const xml = clientDialTwiml([id, "+12045551234", "2045551234"], "conv_1", {
    actionUrl: "https://www.kidease.ca/api/voice/status",
  });
  assert.match(xml, /timeLimit="1800"/);
  assert.match(xml, /action="https:\/\/www\.kidease\.ca\/api\/voice\/status" method="POST"/);
  assert.match(xml, /<Identity>ke/);
  assert.doesNotMatch(xml, /<Number|\+1204|2045551234|<Sip/);
  const noAction = clientDialTwiml([id], "conv_1", { actionUrl: "http://insecure.example/x" });
  assert.doesNotMatch(noAction, /action=/);
  assert.match(noAction, /No one answered/);
  for (const out of [dialActionTwiml("completed"), dialActionTwiml("no-answer"), capReachedTwiml(), clientDialTwiml([])]) {
    assert.doesNotMatch(out, /<Number|<Dial/);
    assert.match(out, /<Hangup\/>/);
  }
  assert.match(dialActionTwiml("busy"), /No one answered/);
  const inbound = incomingVoiceTwiml({ identities: [id, "+12045551234"], recordingCallback: "https://www.kidease.ca/api/voice/recording" });
  assert.doesNotMatch(inbound, /<Number|\+1204/);
  assert.equal(voiceStatusCallbackUrl({}, "https://preview.example/"), "https://preview.example/api/voice/status");
  assert.equal(voiceStatusCallbackUrl({ TWILIO_VOICE_STATUS_URL: "https://pinned/x" }), "https://pinned/x");
  assert.match(src(".env.example"), /TWILIO_VOICE_STATUS_URL/);
});

test("voice cap is reserved per placed call in /api/voice/connect, not per token mint", () => {
  const connect = src("src/routes/api/voice.connect.ts");
  assert.match(connect, /gateMediaSession\("voice"\)/);
  assert.match(connect, /voiceReservationExists\(callSid\)/);
  assert.match(connect, /capReachedTwiml\(\)/);
  assert.doesNotMatch(src("src/lib/server/voice-call.ts"), /gateMediaSession/);
  const status = src("src/routes/api/voice.status.ts");
  assert.match(status, /authorizeTwilioPost\(request, process\.env\.TWILIO_VOICE_STATUS_URL\)/);
  assert.match(status, /settleVoiceCall/);
});

// ---------- real minutes ----------

test("billed minutes round up each started minute; voice bills both legs", () => {
  assert.equal(billedMinutes(0), 0);
  assert.equal(billedMinutes("1"), 1);
  assert.equal(billedMinutes(60), 1);
  assert.equal(billedMinutes(61), 2);
  assert.equal(billedMinutes("abc"), 0);
  assert.equal(voiceCallMinutes("completed", 125), 6);
  assert.equal(voiceCallMinutes("completed", 0), 2);
  assert.equal(voiceCallMinutes("no-answer", 0), 1);
  assert.equal(voiceCallMinutes("busy", 30), 1);
});

test("video StatusCallback: pinned wins, production defaults to the signed route, preview sends none", () => {
  assert.equal(videoStatusCallbackUrl({ TWILIO_VIDEO_STATUS_CALLBACK_URL: "https://x/y" }), "https://x/y");
  assert.equal(videoStatusCallbackUrl({ VERCEL_ENV: "production" }), "https://www.kidease.ca/api/video/status");
  assert.equal(videoStatusCallbackUrl({ VERCEL_ENV: "preview" }), "");
  const route = src("src/routes/api/video.status.ts");
  assert.match(route, /authorizeTwilioPost\(request, process\.env\.TWILIO_VIDEO_STATUS_CALLBACK_URL\)/);
  assert.match(route, /participant-disconnected/);
  assert.match(route, /room-ended/);
});

const migration = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");

async function mediaDb() {
  const pg = new PGlite();
  await pg.exec(migration("0210_outbound_controls.sql")).catch(async () => {
    await pg.exec(`create table if not exists outbound_daily_usage (day date not null, channel text not null, used integer not null default 0, blocked integer not null default 0, alerted_at timestamptz, primary key (day, channel));`);
  });
  await pg.exec(migration("0233_media_sessions.sql"));
  await pg.exec(migration("0233_media_sessions.sql"));
  await pg.query(`insert into outbound_daily_usage (day, channel, used) values ('2026-11-25', 'media', 0) on conflict (day, channel) do update set used = 0`);
  return pg;
}

const used = async (pg) => (await pg.query(`select used from outbound_daily_usage where day = '2026-11-25' and channel = 'media'`)).rows[0].used;

test("video joins settle to real participant minutes, once per participant", async () => {
  const pg = await mediaDb();
  // Two joins reserved 15 minutes each.
  await pg.query(`update outbound_daily_usage set used = 30 where channel = 'media'`);
  await pg.query(MEDIA_RESERVE_SQL, ["ms_a", "video", "RM1", "parent:u1", "c1", "u1", "2026-11-25", 15]);
  await pg.query(MEDIA_RESERVE_SQL, ["ms_b", "video", "RM1", "provider:u2", "c1", "u2", "2026-11-25", 15]);
  await pg.query(SETTLE_VIDEO_PARTICIPANT_SQL, ["RM1", "parent:u1", "PA1", 4]);
  assert.equal(await used(pg), 19);
  // Twilio retries the same callback: no double count.
  await pg.query(SETTLE_VIDEO_PARTICIPANT_SQL, ["RM1", "parent:u1", "PA1", 4]);
  assert.equal(await used(pg), 19);
  // Room ends; the other join never reported, so it settles at no more than the room length.
  await pg.query(SETTLE_VIDEO_ROOM_SQL, ["RM1", 6]);
  assert.equal(await used(pg), 10);
  await pg.query(SETTLE_VIDEO_ROOM_SQL, ["RM1", 6]);
  assert.equal(await used(pg), 10);
  await pg.close();
});

test("voice calls settle once and never push usage below zero", async () => {
  const pg = await mediaDb();
  await pg.query(`update outbound_daily_usage set used = 15 where channel = 'media'`);
  await pg.query(MEDIA_RESERVE_SQL, ["ms_voice_CA1", "voice", "CA1", "keu_00", "c1", "u1", "2026-11-25", 15]);
  await pg.query(MEDIA_RESERVE_SQL, ["ms_voice_CA1", "voice", "CA1", "keu_00", "c1", "u1", "2026-11-25", 15]);
  await pg.query(SETTLE_VOICE_CALL_SQL, ["CA1", 6]);
  assert.equal(await used(pg), 6);
  await pg.query(SETTLE_VOICE_CALL_SQL, ["CA1", 6]);
  assert.equal(await used(pg), 6);
  await pg.query(`update outbound_daily_usage set used = 1 where channel = 'media'`);
  await pg.query(MEDIA_RESERVE_SQL, ["ms_voice_CA2", "voice", "CA2", "keu_00", "c1", "u1", "2026-11-25", 15]);
  await pg.query(SETTLE_VOICE_CALL_SQL, ["CA2", 2]);
  assert.equal(await used(pg), 0);
  await assert.rejects(pg.query(`insert into media_sessions (id, kind, twilio_sid, usage_day) values ('x', 'sms', 's', '2026-11-25')`));
  await pg.exec(migration("down/0233_media_sessions.sql"));
  const left = await pg.query(`select to_regclass('media_sessions') as t`);
  assert.equal(left.rows[0].t, null);
  await pg.close();
});

// ---------- video ring ----------

test("starting a video call posts a Join note and rings the other side in the app", () => {
  const join = src("src/lib/server/video-join.ts");
  assert.match(join, /announceVideoCall\(/);
  assert.match(join, /recordMediaReservation\(/);
  const announce = src("src/lib/server/video-announce.ts");
  assert.match(announce, /VIDEO_ANNOUNCE_WINDOW_MINUTES = 15/);
  assert.match(announce, /status = 'answered'/);
  assert.match(src("src/lib/video-call-note.ts"), /"Video call started - Join"/);
  assert.match(src("src/components/thread-chrome.tsx"), /m\.kind === "video_call"/);
  const rings = src("src/lib/server/call-ring-fns.ts");
  assert.match(rings, /if \(!callPushEnabled\(\)\) return \{ ok: true as const, ringId, timeoutSeconds, sent: 0 \}/);
  assert.match(rings, /export const getIncomingVideoRing/);
  assert.match(src("src/routes/__root.tsx"), /<IncomingVideoAlert \/>/);
  const alert = src("src/components/incoming-video-alert.tsx");
  assert.match(alert, /if \(res && !res\.enabled\)/);
  assert.match(alert, /reason: "declined"/);
});

// ---------- Android prepared switch ----------

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application android:label="KidEase">
    </application>
</manifest>
`;

test("Android: default build still strips camera, mic, and push permissions", () => {
  assert.match(src("scripts/patch-native-permissions.mjs"), /HOLD_CALL_AND_PUSH_PERMISSIONS = true/);
  assert.equal(androidCallMediaRequested({}), false);
  const out = applyCallAndPushPermissions(MANIFEST, { callMedia: false });
  assert.doesNotMatch(out, /CAMERA|RECORD_AUDIO|MODIFY_AUDIO_SETTINGS|POST_NOTIFICATIONS|uses-feature/);
  assert.match(out, /INTERNET/);
});

test("Android: KIDEASE_ANDROID_CALL_MEDIA=1 adds only the three call permissions, features optional", () => {
  assert.equal(androidCallMediaRequested({ KIDEASE_ANDROID_CALL_MEDIA: "1" }), true);
  const out = applyCallAndPushPermissions(MANIFEST, { callMedia: true });
  for (const name of CALL_MEDIA_PERMISSIONS) assert.equal(out.split(`android:name="${name}"`).length - 1, 1, name);
  assert.doesNotMatch(out, /POST_NOTIFICATIONS|USE_FULL_SCREEN_INTENT/);
  assert.match(out, /android\.hardware\.camera" android:required="false"/);
  assert.match(out, /android\.hardware\.microphone" android:required="false"/);
  assert.equal(applyCallAndPushPermissions(out, { callMedia: true }), out);
  const java = src("android/app/src/main/java/ca/kidease/app/MainActivity.java");
  assert.match(java, /next = withCallMediaToken\(next, declaresCallMedia\(\)\)/);
  assert.match(java, /CALL_MEDIA_TOKEN = "KidEaseCallMedia"/);
});

test("committed Android manifests do not declare call media yet", () => {
  for (const flavour of ["main", "play", "samsung", "huawei", "amazon"]) {
    const m = src(`android/app/src/${flavour}/AndroidManifest.xml`);
    assert.doesNotMatch(m, /android\.permission\.(CAMERA|RECORD_AUDIO)/, flavour);
  }
});

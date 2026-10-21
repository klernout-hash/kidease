import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8097;
const BASE = `http://127.0.0.1:${PORT}`;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 KidEaseNative";

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function visible(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
}

test("native commerce is guarded in the page and the component", () => {
  const promote = src("src/components/provider-listing-forms.tsx");
  const provider = src("src/routes/provider.tsx");
  const addons = src("src/components/daycare-addons.tsx");
  const jobs = src("src/routes/jobs_.post.tsx");
  const claim = src("src/routes/claim.tsx");
  const account = src("src/routes/account.tsx");
  const alerts = src("src/components/get-alerts-prompt.tsx");
  const rootDoc = src("src/routes/__root.tsx");
  assert.match(promote, /if \(nativeShell\) return null/);
  assert.match(promote, /data-ke="digital-plan"/);
  assert.match(provider, /centreOwner && nativeShell/);
  assert.match(provider, /centreOwner && !nativeShell/);
  assert.match(addons, /if \(nativeShell \|\| !visible\.length\) return null/);
  assert.match(jobs, /data-commerce=\{nativeShell \? "hidden" : "web"\}/);
  assert.match(claim, /data-commerce=\{nativeShell \? "hidden" : "web"\}/);
  assert.match(claim, /nativeShell && entry\[1\] === "perkPayLive"/);
  assert.match(account, /search\.section === "alerts"/);
  assert.match(account, /nativeShell && \(item\.id === "alerts" \|\| item\.id === "subscription"\)/);
  assert.match(alerts, /if \(nativeShell \|\| !open\) return null/);
  assert.match(rootDoc, /nativeShell \? null : <GetAlertsPrompt \/>/);
  const video = src("src/components/video-room-panel.tsx");
  const voice = src("src/components/voice-call-panel.tsx");
  const videoRoute = src("src/routes/video.$roomId.tsx");
  const callRoute = src("src/routes/call.$conversationId.tsx");
  const desk = src("src/components/daycare-desk-home.tsx");
  assert.match(video, /import\("twilio-video"\)/);
  assert.doesNotMatch(video, /isNative\(\)/);
  assert.match(voice, /import\("@twilio\/voice-sdk"\)/);
  assert.doesNotMatch(voice, /isNative\(\)/);
  assert.match(videoRoute, /nativeVideoNeedsPlus/);
  assert.match(videoRoute, /data-ke="native-video-entitlement"/);
  assert.doesNotMatch(videoRoute, /data-ke="native-video-off"/);
  assert.match(videoRoute, /nativeShell \? t\("videoJoinHint"\) : t\("videoTourLead"\)/);
  assert.match(callRoute, /VoiceCallPanel/);
  assert.doesNotMatch(callRoute, /comingSoon/);
  assert.match(desk, /nativeShell \? null : \(/);
  assert.match(desk, /data-ke="daycare-plan"/);
  const login = src("src/routes/login.tsx");
  assert.match(login, /signup-adult/);
  assert.match(login, /signin-adult/);
  assert.match(login, /if \(!operator && !adult\)/);
  assert.match(src("package.json"), /"node": ">=22"/);
  assert.equal(src(".nvmrc").trim(), "22");
  assert.match(src("ios/App/App.xcodeproj/project.pbxproj"), /SdkPrivacy/);
  assert.match(src("ios/App/SdkPrivacy/Package.swift"), /SentryPrivacy/);
  assert.match(src("ios/App/SdkPrivacy/Package.swift"), /PostHogPrivacy/);
  assert.match(src("ios/App/SdkPrivacy/Sources/CapacitorGeolocationPrivacy/PrivacyInfo.xcprivacy"), /PreciseLocation/);
  assert.match(src("ios/App/App/PrivacyInfo.xcprivacy"), /NSPrivacyCollectedDataTypeAudioData/);
  assert.doesNotMatch(src("ios/App/SdkPrivacy/Package.swift"), /Push/);
  assert.match(src("docs/app-store-privacy.md"), /Twilio Voice/);
  assert.match(src("docs/play-data-safety.md"), /twilio-video/);
  assert.match(src("src/lib/legal-copy.ts"), /Twilio, for voice and video calls/);
  assert.match(src("src/lib/store-listing.ts"), /secondaryCategory: "Productivity"/);
  assert.doesNotMatch(src("ios/App/App/App.entitlements"), /aps-environment/);
  assert.match(src("docs/store-review-notes.md"), /production database/);
  assert.match(src("docs/store-review-notes.md"), /Push notifications are not in this version/);
  assert.doesNotMatch(src("docs/store-review-notes.md"), /Push notifications for message/);
});

test("key routes with the native user agent have no prices, Stripe, or upgrade text", async () => {
  const child = spawn(
    process.execPath,
    [join(root, "node_modules/vite/bin/vite.js"), "dev", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    {
      cwd: root,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none" },
    },
  );
  let log = "";
  child.stdout?.on("data", (chunk) => {
    log += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    log += chunk.toString();
  });
  const routes = [
    "/plans",
    "/fr/plans",
    "/jobs/post",
    "/fr/jobs/post",
    "/claim",
    "/fr/claim",
    "/provider?desk=promote",
    "/account?section=alerts",
    "/pay",
    "/provider",
    "/call/reviewer-demo",
    "/video/reviewer-demo",
  ];
  try {
    const deadline = Date.now() + 90_000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const probe = await fetch(`${BASE}/plans`, { headers: { "user-agent": UA } });
        if (probe.status < 500) {
          ready = true;
          break;
        }
      } catch {
        /* vite is still booting */
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    assert.equal(ready, true, `vite did not start\n${log.slice(-2000)}`);

    for (const path of routes) {
      const response = await fetch(`${BASE}${path}`, { headers: { "user-agent": UA }, redirect: "follow" });
      const html = await response.text();
      const text = visible(html);
      assert.ok(response.status < 500, `${path} status ${response.status}`);
      assert.match(html, /data-runtime="native"/, path);
      assert.doesNotMatch(text, /CA\$/, path);
      assert.doesNotMatch(html, /stripe\.com/i, path);
      assert.doesNotMatch(text, /\bUpgrade\b/, path);
      assert.doesNotMatch(text, /Améliorer/, path);
      assert.doesNotMatch(text, /Claim boost/i, path);
      assert.doesNotMatch(text, /Boost de réclamation/, path);
      assert.doesNotMatch(text, /Job post/, path);
      assert.doesNotMatch(text, /Payments processed in the app/, path);
      assert.doesNotMatch(html, /data-ke="alert-settings"/, path);
      assert.doesNotMatch(text, /data-ke="native-video-off"/, path);
      assert.doesNotMatch(text, /data-ke="native-voice-off"/, path);
      assert.doesNotMatch(text, /data-ke="daycare-plan"/, path);
      assert.doesNotMatch(text, /FEATURE_VIDEO is off/, path);
      assert.doesNotMatch(text, /Parent Plus is required/, path);
      assert.doesNotMatch(text, /Start Plus/, path);
      assert.doesNotMatch(text, /Activer Plus/, path);
    }
    for (const path of ["/call/reviewer-demo", "/video/reviewer-demo"]) {
      const response = await fetch(`${BASE}${path}`, { headers: { "user-agent": UA }, redirect: "follow" });
      const html = await response.text();
      const text = visible(html);
      assert.ok(response.status < 500, path);
      assert.match(html, /data-runtime="native"/, path);
      assert.doesNotMatch(text, /CA\$/, path);
      assert.doesNotMatch(text, /Coming soon\. FEATURE_VIDEO/, path);
      assert.match(src("src/routes/call.$conversationId.tsx"), /VoiceCallPanel/);
      assert.match(src("src/components/video-room-panel.tsx"), /twilio-video/);
    }
    const jobs = await fetch(`${BASE}/jobs/post`, { headers: { "user-agent": UA } });
    assert.match(await jobs.text(), /data-commerce="hidden"/);
    const claim = await fetch(`${BASE}/claim`, { headers: { "user-agent": UA } });
    assert.match(await claim.text(), /data-commerce="hidden"/);
  } finally {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
});

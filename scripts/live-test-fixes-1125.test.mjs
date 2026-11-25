// KB-24 live-test fixes (Nov 25 2026): FR kiosk/welcome SSR, runtime-built
// imports (signup mail, Titan SMTP, R2 delete), sanitized Titan logs, get-app
// store claims.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  TitanSmtpError,
  resolveTitanConfig,
  smtpExpect,
  titanFailureDetail,
  withTitanErrorFields,
} from "../src/lib/server/titan-mail.ts";
import { formatTransactionalMailLog, resetOtpMailHealth, readOtpMailHealth, sendTransactionalMail } from "../src/lib/transactional-mail.ts";
import { otpMailOrderLabel } from "../src/lib/otp-mail-order.ts";
import { APP_STORES, appPlatformsLabel, storeLinkAllowed } from "../src/lib/app-stores.ts";

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const FAKE_PW = "not-a-real-password-xyz";

function fnBody(text, name) {
  const start = text.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const next = text.indexOf("\nexport ", start + 10);
  return text.slice(start, next < 0 ? undefined : next);
}

test("F1: shared kiosk/welcome pages do not call the English Route hooks", () => {
  const kiosk = fnBody(src("src/routes/kiosk.tsx"), "KioskPage");
  const welcome = fnBody(src("src/routes/welcome.$code.tsx"), "WelcomePage");
  assert.doesNotMatch(kiosk, /Route\.use/);
  assert.doesNotMatch(welcome, /Route\.use/);
  assert.match(kiosk, /\{ access, preview \}/);
  assert.match(welcome, /\{ code \}: \{ code: string \}/);
});

test("F1: /fr/kiosk and /fr/welcome read their own route data", () => {
  const frKiosk = src("src/routes/fr.kiosk.tsx");
  const frWelcome = src("src/routes/fr.welcome.$code.tsx");
  assert.match(frKiosk, /createFileRoute\("\/fr\/kiosk"\)/);
  assert.match(frKiosk, /component: FrKioskRoute/);
  assert.match(frKiosk, /Route\.useLoaderData\(\)[\s\S]*<KioskPage access=\{access\} preview=\{preview\} \/>/);
  assert.match(frWelcome, /component: FrWelcomeRoute/);
  assert.match(frWelcome, /Route\.useParams\(\)[\s\S]*<WelcomePage code=\{code\} \/>/);
  assert.doesNotMatch(frKiosk, /component: KioskPage/);
  assert.doesNotMatch(frWelcome, /component: WelcomePage/);
});

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

test("F2 + Titan + R2: no runtime-built import paths anywhere in src", () => {
  const root = new URL("../src", import.meta.url).pathname;
  const offenders = [];
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    if (/import\(\s*\/\*\s*@vite-ignore\s*\*\/\s*[A-Za-z_$]/.test(text)) offenders.push(file);
    if (/"(@\/lib\/|\.\/)[^"\s]*\/"\s*\+\s*"/.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], "runtime-built paths are not bundled and throw ERR_MODULE_NOT_FOUND on Vercel");
});

test("F2: signup user mail uses a literal (bundled) import in family.ts", () => {
  const family = src("src/lib/server/family.ts");
  assert.match(family, /const \{ afterNewAccountUserMail \} = await import\("@\/lib\/server\/signup-user-mail\.server"\);/);
  // A top-level import of a *.server file is denied by import-protection (client graph).
  assert.doesNotMatch(family, /^import [^\n]*\.server";/m);
  assert.match(family, /const afterNewAccountUserMailServerOnly = createServerOnlyFn\(/);
  assert.match(family, /await afterNewAccountUserMailServerOnly\(userId, role\)/);
  assert.doesNotMatch(family, /mailFile/);
});

test("Titan SMTP sender uses a literal import path Vite can bundle", () => {
  const mail = src("src/lib/transactional-mail.ts");
  assert.match(mail, /await import\("\.\/server\/titan-mail\.server\.ts"\)/);
  assert.doesNotMatch(mail, /titanFile/);
  const vault = src("src/lib/server/family-vault.ts");
  assert.match(vault, /await import\("@\/lib\/server\/r2\.server"\)/);
  // Both modules are in the client graph: the *.server import must sit inside
  // createServerOnlyFn so import-protection strips it from the client build.
  assert.match(mail, /const defaultSendTitan = createServerOnlyFn\(/);
  assert.match(vault, /const deleteR2FamilyObject = createServerOnlyFn\(/);
  assert.match(vault, /await deleteR2FamilyObject\(value\)/);
});

test("titanFailureDetail: codes only, never the password or reply text", () => {
  const auth = new TitanSmtpError(`login failed for kyle@kidease.ca ${FAKE_PW}`, 535, "AUTH");
  assert.equal(titanFailureDetail(auth), "code=EAUTH response=535 command=AUTH");
  assert.equal(titanFailureDetail(new TitanSmtpError("x", 553, "MAIL")), "code=EENVELOPE response=553 command=MAIL");
  assert.equal(titanFailureDetail(Object.assign(new Error("connect ETIMEDOUT 1.2.3.4:465"), { code: "ETIMEDOUT" })), "code=ETIMEDOUT");
  assert.equal(titanFailureDetail(new Error("Titan closed the connection.")), "code=ECONNECTION");
  assert.equal(
    titanFailureDetail(new Error("Cannot find package '@/lib' imported from /var/task/index.mjs")),
    "code=ERR_MODULE_NOT_FOUND",
  );
  assert.equal(titanFailureDetail(new Error(`weird ${FAKE_PW}`)), "code=EUNKNOWN");
  assert.equal(titanFailureDetail(Object.assign(new Error("x"), { code: "bad code; rm -rf" })), "code=EUNKNOWN");
  for (const err of [auth, new Error(FAKE_PW)]) assert.doesNotMatch(titanFailureDetail(err), new RegExp(FAKE_PW));
  const wrapped = withTitanErrorFields("Titan rejected the mailbox login.", auth);
  assert.equal(titanFailureDetail(wrapped), "code=EAUTH response=535 command=AUTH");
});

test("smtpExpect throws TitanSmtpError with the reply code and failed command", async () => {
  const io = { writeLine() {}, writeRaw() {}, readReply: async () => ({ code: 553, lines: ["sender not owned by user"] }) };
  await assert.rejects(() => smtpExpect(io, [250], "MAIL"), (err) => {
    assert.ok(err instanceof TitanSmtpError);
    assert.equal(err.responseCode, 553);
    assert.equal(err.command, "MAIL");
    return true;
  });
});

test("Titan From is always the signed-in mailbox, keeping MAIL_FROM's display name", () => {
  for (const MAIL_FROM of ["KidEase Support <support@kidease.ca>", "KidEase <noreply@kidease.ca>"]) {
    const r = resolveTitanConfig({ TITAN_APP_PASSWORD: FAKE_PW, TITAN_USER: "kyle@kidease.ca", MAIL_FROM });
    assert.equal(r.ok, true);
    if (!r.ok) continue;
    assert.equal(r.config.fromEmail, "kyle@kidease.ca");
    assert.match(r.config.fromHeader, /<kyle@kidease\.ca>$/);
  }
  const same = resolveTitanConfig({ TITAN_APP_PASSWORD: FAKE_PW, TITAN_USER: "kyle@kidease.ca", MAIL_FROM: "Kyle at KidEase <kyle@kidease.ca>" });
  assert.equal(same.ok && same.config.fromHeader, "Kyle at KidEase <kyle@kidease.ca>");
});

test("titan_fail log carries sanitized detail; no password, code or keys", async () => {
  resetOtpMailHealth();
  const logs = [];
  const result = await sendTransactionalMail(
    { purpose: "2fa", to: "staff@example.com", subject: "Your KidEase sign-in code", text: "654321", html: "<p>654321</p>" },
    {
      fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: "r1" }) }),
      sendTitan: async () => {
        throw withTitanErrorFields(`auth failed ${FAKE_PW}`, new TitanSmtpError(`535 ${FAKE_PW}`, 535, "AUTH"));
      },
      env: { ADMIN_EMAIL: "kyle@kidease.ca", TITAN_USER: "kyle@kidease.ca", RESEND_API_KEY: "re_test", TITAN_APP_PASSWORD: FAKE_PW },
      log: (line) => logs.push(line),
    },
  );
  assert.equal(result.via, "resend");
  const fail = logs.find((l) => l.includes("event=titan_fail"));
  assert.ok(fail);
  assert.match(fail, /reason=rejected code=EAUTH response=535 command=AUTH/);
  assert.equal(logs.some((l) => new RegExp(`${FAKE_PW}|654321|re_test`).test(l)), false);
  assert.equal(readOtpMailHealth().lastEvent, "resend_ok");
});

test("formatTransactionalMailLog drops a detail that is not key=value codes", () => {
  const line = formatTransactionalMailLog({ purpose: "2fa", event: "titan_fail", via: "titan", reason: "rejected", detail: `password=${FAKE_PW} extra junk!` });
  assert.doesNotMatch(line, new RegExp(FAKE_PW));
});

test("admin IMAP listing logs success and failure with codes only", () => {
  const admin = src("src/lib/server/admin-mail.ts");
  assert.match(admin, /event=imap_list_ok via=titan count=\$\{messages\.length\}/);
  assert.match(admin, /event=imap_list_fail via=titan \$\{titanFailureDetail\(err\)\}/);
});

test("admin OTP mail label shows the real order: Titan first, then Resend", () => {
  assert.equal(
    otpMailOrderLabel({ titanConfigured: true, resendConfigured: true, sendgridConfigured: false }),
    "Sign-in codes: Titan first, then Resend · SendGrid off",
  );
  assert.equal(
    otpMailOrderLabel({ titanConfigured: false, resendConfigured: true, sendgridConfigured: false }),
    "Sign-in codes: Resend first · Titan off (no TITAN_APP_PASSWORD) · SendGrid off",
  );
  assert.equal(otpMailOrderLabel({ titanConfigured: false, resendConfigured: false, sendgridConfigured: false }), "Sign-in codes: no mail provider set");
  const ui = src("src/components/admin-mail.tsx");
  assert.match(ui, /otpMailOrderLabel\(status\.otpMail\)/);
  assert.doesNotMatch(ui, /Titan fallback ready/);
});

test("get-app names only platforms with a live store", () => {
  assert.equal(appPlatformsLabel("en"), "Android phones and tablets and the web");
  assert.equal(appPlatformsLabel("fr"), "Téléphones et tablettes Android et navigateur Web");
  const allLive = APP_STORES.map((s) => ({ ...s, live: true, url: s.url ?? "https://example.com" }));
  assert.equal(appPlatformsLabel("en", allLive), "iPhone and iPad, Android phones and tablets, Windows, and the web");
  for (const label of [appPlatformsLabel("en"), appPlatformsLabel("fr")]) assert.doesNotMatch(label, /iPhone|iPad|Mac|Windows/);
  const seo = src("src/lib/page-seo.ts");
  assert.doesNotMatch(seo, /iPhone, Android, Mac/);
  assert.match(seo, /appPlatformsLabel\("en"\)/);
  assert.match(seo, /appPlatformsLabel\("fr"\)/);
});

test("Galaxy and Microsoft links stay hidden until their listing is live", () => {
  assert.equal(storeLinkAllowed("samsung"), false);
  assert.equal(storeLinkAllowed("microsoft"), false);
  assert.equal(storeLinkAllowed("play"), true);
  assert.match(src("src/components/samsung-store-link.tsx"), /if \(!on \|\| !storeLinkAllowed\("samsung"\)\) return null;/);
  assert.match(src("src/components/microsoft-store-link.tsx"), /if \(!url \|\| !storeLinkAllowed\("microsoft"\)\) return null;/);
  assert.doesNotMatch(src("src/routes/get-app.tsx"), /\{t\("getAppKicker"\)\}<\/p>/);
});

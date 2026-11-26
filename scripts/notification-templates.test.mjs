import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { brandedNotice, renderBrandedEmail, renderBrandedText } from "../src/lib/email-layout.ts";
import {
  billReminderEmail,
  contactAutoReplyEmail,
  fitsOneSegment,
  formatLongDate,
  gsmLength,
  openSpotsCheckinEmail,
  openSpotsCheckinSms,
  spotOfferEmail,
  withSmsOptOut,
  withdrawalCancelledEmail,
  withdrawalNoticeEmail,
  withdrawalNoticeSms,
} from "../src/lib/notification-templates.ts";
import { signOpenSpotsShortToken, signOpenSpotsToken, verifyOpenSpotsToken } from "../src/lib/open-spots-checkin-token.ts";

const LOCALES = ["en", "fr"];
const links = { 0: "https://www.kidease.ca/spots/t?band=0", 1: "https://www.kidease.ca/spots/t?band=1", 2: "https://www.kidease.ca/spots/t?band=2", 3: "https://www.kidease.ca/spots/t?band=3" };
const withdrawal = { parentName: "John Doe", childName: "Emma Doe", centreName: "KidEase Test Daycare (QA)", lastDay: "2026-12-18", reason: "Moving to Brandon." };

function all(locale) {
  return [
    openSpotsCheckinEmail({ locale, centreName: "Little Oaks Child Care Centre", views: 14, links }),
    spotOfferEmail({ locale, parentName: "John Doe", childName: "Emma", centreName: "Little Oaks", ageGroup: "toddler", startDate: "2027-01-04", expiresAt: "2026-11-28T03:00:00Z", province: "MB", href: "https://www.kidease.ca/offer/x" }),
    withdrawalNoticeEmail({ locale, ...withdrawal }),
    withdrawalCancelledEmail({ locale, ...withdrawal }),
    billReminderEmail({ locale, parentName: "John Doe", childName: "Emma", centreName: "Little Oaks", number: "KE-1", amountCents: 64500, dueDate: "2026-12-01", payOnline: false }),
    contactAutoReplyEmail({ locale, name: "John Doe" }),
  ];
}

test("every email: one heading, one primary button, sign-off, reason, Help/Privacy, Manitoba line, footer in its language", () => {
  for (const locale of LOCALES) {
    for (const mail of all(locale)) {
      const html = renderBrandedEmail(mail.branded);
      assert.equal((html.match(/<h1/g) || []).length, 1);
      assert.ok((html.match(/class="ke-btn"/g) || []).length <= 1, mail.subject);
      assert.match(html, /Winnipeg, Manitoba, Canada/);
      assert.ok(mail.branded.reason, mail.subject);
      if (locale === "fr") {
        assert.match(html, /L’équipe KidEase/);
        assert.match(html, />Aide</);
        assert.match(html, />Confidentialité</);
        assert.match(html, /lang="fr-CA"/);
        assert.doesNotMatch(html, />Help<|>Privacy<|The KidEase team/);
      } else {
        assert.match(html, /The KidEase team/);
        assert.match(html, />Help</);
      }
      assert.doesNotMatch(html + mail.subject, /Search and messages at no charge|no waitlist fee|Tap one number|No login\.|3\+ means three/i);
    }
  }
});

test("check-in email: 0/1/2/3+ are buttons, never raw link text", () => {
  for (const locale of LOCALES) {
    const html = renderBrandedEmail(openSpotsCheckinEmail({ locale, centreName: "Little Oaks", views: 3, links }).branded);
    assert.equal((html.match(/class="ke-choice"/g) || []).length, 4);
    assert.ok(html.includes(">3+</a>"));
    // The URL only appears inside href attributes.
    assert.equal(html.split(links[0]).length - 1, 1);
    assert.doesNotMatch(html.replace(/href="[^"]*"/g, ""), /https:\/\/www\.kidease\.ca\/spots/);
  }
});

test("bill reminder never promises online payment while pay is off", () => {
  for (const locale of LOCALES) {
    const off = billReminderEmail({ locale, centreName: "Little Oaks", centrePhone: "204-555-0100", childName: "Emma", number: "KE-1", amountCents: 64500, dueDate: "2026-12-01", payOnline: false });
    const text = renderBrandedText(off.branded);
    assert.doesNotMatch(text, /pay it in your KidEase account|pay online in your|payez-la dans votre compte|View and pay|Voir et payer/i);
    assert.match(text, locale === "fr" ? /communiquez directement avec Little Oaks/ : /contact Little Oaks directly/);
    assert.match(text, /645,00\s\$|\$645\.00/);
    assert.match(text, /Emma/);
    assert.match(text, locale === "fr" ? /1 décembre 2026|1er décembre 2026/ : /December 1, 2026/);
    const on = billReminderEmail({ locale, centreName: "Little Oaks", number: "KE-1", amountCents: 100, payOnline: true });
    assert.match(renderBrandedText(on.branded), locale === "fr" ? /payer en ligne/ : /pay it online/);
  }
});

test("withdrawal email names child and parent, friendly date, View notice, next steps", () => {
  const en = renderBrandedText(withdrawalNoticeEmail({ locale: "en", ...withdrawal }).branded);
  for (const s of ["Emma Doe", "John Doe", "Friday, December 18, 2026", "View notice", "What to do next", "Moving to Brandon."]) assert.ok(en.includes(s), s);
  const fr = renderBrandedText(withdrawalNoticeEmail({ locale: "fr", ...withdrawal }).branded);
  for (const s of ["Emma Doe", "vendredi 18 décembre 2026", "Voir le préavis", "Prochaines étapes"]) assert.ok(fr.includes(s), s);
});

test("spot offer names child, program, start date and what happens after 48 hours", () => {
  const t = renderBrandedText(spotOfferEmail({ locale: "en", childName: "Emma", centreName: "Little Oaks", ageGroup: "toddler", startDate: "2027-01-04", expiresAt: "2026-11-28T03:00:00Z", province: "MB", href: "https://www.kidease.ca/offer/x" }).branded);
  for (const s of ["Emma", "Toddler", "Monday, January 4, 2027", "next family on the waitlist", "Friday, November 27 at "]) assert.ok(t.includes(s), s);
  const fr = renderBrandedText(spotOfferEmail({ locale: "fr", childName: "Emma", centreName: "Little Oaks", ageGroup: "toddler", startDate: "2027-01-04", expiresAt: "2026-11-28T03:00:00Z", province: "MB", href: "https://www.kidease.ca/offer/x" }).branded);
  for (const s of ["Emma", "Trottineurs", "lundi 4 janvier 2027", "famille suivante"]) assert.ok(fr.includes(s), s);
});

test("texts: one GSM-7 segment, from KidEase, with STOP, for long names too", () => {
  const secret = "test-secret";
  const short = signOpenSpotsShortToken({ daycareId: "dc_ab12cd34ef56gh78", exp: Date.parse("2026-12-09T00:00:00Z") }, secret);
  const url = `https://kidease.ca/spots/${short}`;
  const names = ["Little Oaks", "KidEase Test Daycare (QA)", "Les Petits Explorateurs de Saint-Boniface Centre d’apprentissage préscolaire"];
  for (const locale of LOCALES) {
    for (const centreName of names) {
      const sms = openSpotsCheckinSms({ locale, centreName, url });
      assert.ok(fitsOneSegment(sms), `${locale} ${sms.length}: ${sms}`);
      assert.match(sms, /^KidEase/);
      assert.match(sms, /STOP/);
      assert.ok(sms.includes(url));
    }
    for (const childName of ["Emma Doe", "Maximilian Alexander Featherstonehaugh-Smythe"]) {
      const sms = withdrawalNoticeSms({ locale, ...withdrawal, childName });
      assert.ok(fitsOneSegment(sms), `${locale}: ${sms}`);
      assert.match(sms, /^KidEase/);
      assert.match(sms, /STOP/);
    }
  }
  assert.equal(gsmLength("Prêt"), null);
  assert.match(withSmsOptOut("Last day requested: 2026-12-18."), /^KidEase: .* Reply STOP to opt out\.$/);
  assert.match(withSmsOptOut("Dernier jour", "fr"), /Répondez STOP/);
});

test("short check-in token verifies, expires, and rejects tampering; long token still works", () => {
  const secret = "s3cret";
  const exp = Date.parse("2026-12-09T00:00:00Z");
  const now = Date.parse("2026-11-25T00:00:00Z");
  const t = signOpenSpotsShortToken({ daycareId: "dc_ab12cd34ef56gh78", exp }, secret);
  assert.ok(t && t.length < 50, t);
  assert.equal(verifyOpenSpotsToken(t, secret, now)?.daycareId, "dc_ab12cd34ef56gh78");
  assert.equal(verifyOpenSpotsToken(t, secret, exp + 1000), null);
  assert.equal(verifyOpenSpotsToken(t, "other", now), null);
  assert.equal(verifyOpenSpotsToken(t.replace("dc_ab12", "dc_zz12"), secret, now), null);
  assert.equal(signOpenSpotsShortToken({ daycareId: "has space", exp }, secret), null);
  const long = signOpenSpotsToken({ daycareId: "dc_1", exp }, secret);
  assert.equal(verifyOpenSpotsToken(long, secret, now)?.daycareId, "dc_1");
});

test("brandedNotice keeps each line as its own paragraph (no run-together links)", () => {
  const b = brandedNotice({ heading: "h", text: "One\n0: https://a.ca/0\n1: https://a.ca/1" });
  assert.equal(b.blocks.length, 3);
  assert.equal(brandedNotice({ heading: "code", text: "x", code: "123456" }).signoff, false);
});

test("dates read naturally in both languages", () => {
  assert.equal(formatLongDate("2026-12-18", "en"), "Friday, December 18, 2026");
  assert.equal(formatLongDate("2026-12-18", "fr"), "vendredi 18 décembre 2026");
});

test("senders use the shared templates", () => {
  const read = (rel) => readFileSync(new URL("../" + rel, import.meta.url), "utf8");
  assert.match(read("src/lib/server/open-spots-checkin.ts"), /openSpotsCheckinEmail[\s\S]*openSpotsCheckinSms[\s\S]*signOpenSpotsShortToken/);
  assert.match(read("src/lib/server/spot-offers.ts"), /spotOfferEmail/);
  assert.match(read("src/lib/server/wiring/withdrawal.ts"), /withdrawalNoticeEmail[\s\S]*withdrawalNoticeSms/);
  assert.match(read("src/lib/server/wiring/runtime.ts"), /withSmsOptOut/);
  assert.match(read("src/lib/server/notify.ts"), /contactAutoReplyEmail/);
});

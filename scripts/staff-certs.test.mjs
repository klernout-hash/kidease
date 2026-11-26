import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  certAlert,
  certStatus,
  cleanCertInput,
  parseCertLink,
  staffCertCopy,
} from "../src/lib/staff-certs.ts";

const now = new Date("2026-11-25T18:00:00.000Z");

test("certificate status: expired, due within 60 days, current", () => {
  assert.equal(certStatus("2026-11-24", now), "expired");
  assert.equal(certStatus("2026-11-25", now), "due");
  assert.equal(certStatus("2027-01-24", now), "due");
  assert.equal(certStatus("2027-01-25", now), "ok");
  assert.equal(certStatus("", now), "unknown");
});

test("bell alerts only for due or expired dates after the alert cutoff", () => {
  const due = certAlert("2026-12-20", now);
  assert.equal(due?.status, "due");
  assert.equal(due?.at, "2026-11-09T02:45:00.000Z");
  assert.equal(certAlert("2026-11-20", now)?.status, "expired");
  assert.equal(certAlert("2027-06-01", now), null);
  assert.equal(certAlert("2019-01-01", now), null);
});

test("link body round-trips and rejects junk", () => {
  const link = {
    certId: "ece_1",
    daycareId: "dc",
    staffUserId: "u1",
    fileRef: "centre-docs/x.pdf",
    fileMime: "application/pdf",
    fileName: "c.pdf",
  };
  assert.deepEqual(parseCertLink(JSON.stringify(link)), link);
  assert.equal(parseCertLink("nope"), null);
  assert.equal(parseCertLink(JSON.stringify({ certId: 1 })), null);
  assert.equal(parseCertLink(JSON.stringify({ certId: "a", daycareId: "b" })).staffUserId, null);
});

test("cert input needs a real date and trims fields", () => {
  assert.deepEqual(cleanCertInput({ expiresOn: "x" }), { ok: false, error: "date" });
  const ok = cleanCertInput({
    level: " ECE II ",
    certificateNumber: " 123 ",
    expiresOn: "2027-03-01",
  });
  assert.deepEqual(ok, {
    ok: true,
    level: "ECE II",
    certificateNumber: "123",
    expiresOn: "2027-03-01",
  });
});

test("EN and FR copy match", () => {
  assert.deepEqual(
    Object.keys(staffCertCopy("fr")).sort(),
    Object.keys(staffCertCopy("en")).sort(),
  );
});

test("owner and staff panels, private file storage, and bell alerts are wired", () => {
  const provider = readFileSync(new URL("../src/routes/provider.tsx", import.meta.url), "utf8");
  assert.match(provider, /centreOwner \? <CentreEceCerts \/> : null/);
  assert.match(provider, /<MyEceCerts \/>/);
  const server = readFileSync(new URL("../src/lib/server/staff-certs.ts", import.meta.url), "utf8");
  assert.match(server, /persistPrivateDoc/);
  assert.match(server, /if \(!self && !centre\) throw/);
  assert.doesNotMatch(server, /sendTransactionalMail|sendSms/);
  const bell = readFileSync(
    new URL("../src/lib/server/pipeline-notifications.ts", import.meta.url),
    "utf8",
  );
  assert.match(bell, /notifCertExpired/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { privacyCase, securityStatementAllowed } from "../src/lib/phase1-ops.ts";

test("security statements need evidence and privacy cases do not send", () => {
  assert.equal(securityStatementAllowed({ claim: "We use HTTPS", evidenceReviewedAt: null, now: new Date() }), false);
  assert.equal(
    securityStatementAllowed({
      claim: "ISO 27001 certified",
      evidenceReviewedAt: "2026-11-01",
      now: new Date("2026-11-11T00:00:00.000Z"),
    }),
    false,
  );
  const page = readFileSync(new URL("../src/components/security-page.tsx", import.meta.url), "utf8");
  assert.match(page, /does not claim a security certification|ne revendique aucune certification/);
  assert.match(page, /data-ke="privacy-request"/);
  assert.match(readFileSync(new URL("../src/routes/security.tsx", import.meta.url), "utf8"), /\/security/);
  assert.match(readFileSync(new URL("../src/routes/trust.tsx", import.meta.url), "utf8"), /\/trust/);
  assert.match(readFileSync(new URL("../src/components/audit-desk-link.tsx", import.meta.url), "utf8"), /if \(!on\) return null/);
  const made = privacyCase({ type: "deletion", requesterId: "user-12345678" });
  assert.equal(made.visibleTo, "privacy_officer");
  assert.match(readFileSync(new URL("../migrations/0201_privacy_requests.sql", import.meta.url), "utf8"), /privacy_requests/);
});

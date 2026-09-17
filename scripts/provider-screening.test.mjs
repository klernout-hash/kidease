import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "url";
import { test } from "node:test";
import {
  CA_PROVINCE_CODES,
  SCREENING_REQUIREMENTS,
  centreEarnsScreeningOnFile,
  decideAdminScreeningReview,
  decideScreeningAccess,
  deskRoleToScreeningRole,
  effectiveDocStatus,
  parseScreeningUpload,
  requirementsFor,
  screeningLetterHtml,
} from "../src/lib/provider-screening.ts";
import {
  inferPrivateDocMime,
  licenseDocHref,
  licenseReviewMarker,
  screeningDocHref,
} from "../src/lib/private-docs.ts";
import { allowPrivateDocType, isPrivateDocKey } from "../src/lib/server/r2.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("MB pack requires VSC + child abuse registry, and prior contact for home-based", () => {
  const owner = requirementsFor("MB", "owner", false).map((r) => r.docKind).sort();
  assert.deepEqual(owner, ["child_abuse_registry", "vsc"]);
  const homeOwner = requirementsFor("MB", "owner", true).map((r) => r.docKind).sort();
  assert.deepEqual(homeOwner, ["child_abuse_registry", "prior_contact", "vsc"]);
  const resident = requirementsFor("MB", "home_resident", true).map((r) => r.docKind).sort();
  assert.deepEqual(resident, ["child_abuse_registry", "prior_contact", "vsc"]);
  assert.equal(requirementsFor("MB", "home_resident", false).length, 0);
  for (const role of ["owner", "director", "staff", "volunteer"]) {
    const kinds = requirementsFor("MB", role, false).map((r) => r.docKind);
    assert.ok(kinds.includes("vsc"), role);
    assert.ok(kinds.includes("child_abuse_registry"), role);
  }
});

test("stub provinces require VSC for owner and staff and stay marked stub", () => {
  for (const code of CA_PROVINCE_CODES) {
    if (code === "MB") continue;
    const owner = requirementsFor(code, "owner", false);
    const staff = requirementsFor(code, "staff", false);
    assert.equal(owner.length, 1, code);
    assert.equal(owner[0].docKind, "vsc");
    assert.equal(owner[0].packStatus, "stub");
    assert.equal(staff[0].docKind, "vsc");
    assert.match(staff[0].notes, /will be added later/i);
  }
  const mb = SCREENING_REQUIREMENTS.filter((r) => r.province === "MB");
  assert.ok(mb.every((r) => r.packStatus === "seeded"));
  assert.ok(mb.length >= 15);
});

test("desk roles map onto screening roles without inventing a parallel employee table", () => {
  assert.equal(deskRoleToScreeningRole("owner"), "owner");
  assert.equal(deskRoleToScreeningRole("manager"), "director");
  assert.equal(deskRoleToScreeningRole("staff"), "staff");
  assert.equal(deskRoleToScreeningRole("read_only"), "volunteer");
});

test("Screening on file is earned only when every required current doc is cleared", () => {
  const people = [{ id: "p1", screeningRole: "owner" }];
  assert.equal(
    centreEarnsScreeningOnFile({
      province: "MB",
      facilityType: "child_care_centre",
      people,
      documents: [],
    }),
    false,
  );
  assert.equal(
    centreEarnsScreeningOnFile({
      province: "MB",
      facilityType: "child_care_centre",
      people,
      documents: [
        { personId: "p1", docKind: "vsc", status: "cleared", expiresOn: "2099-01-01" },
        { personId: "p1", docKind: "child_abuse_registry", status: "admin_review" },
      ],
    }),
    false,
  );
  assert.equal(
    centreEarnsScreeningOnFile({
      province: "MB",
      facilityType: "child_care_centre",
      people,
      documents: [
        { personId: "p1", docKind: "vsc", status: "cleared", expiresOn: "2099-01-01" },
        { personId: "p1", docKind: "child_abuse_registry", status: "cleared", expiresOn: "2099-01-01" },
      ],
    }),
    true,
  );
  assert.equal(
    centreEarnsScreeningOnFile({
      province: "MB",
      facilityType: "child_care_centre",
      people,
      documents: [
        { personId: "p1", docKind: "vsc", status: "cleared", expiresOn: "2020-01-01" },
        { personId: "p1", docKind: "child_abuse_registry", status: "cleared", expiresOn: "2099-01-01" },
      ],
    }),
    false,
  );
});

test("self-attest alone does not earn the new public badge", () => {
  const trust = src("src/lib/trust.ts");
  assert.match(trust, /if \(item\.screeningOnFile\)/);
  assert.match(trust, /id: "screening_on_file"/);
  assert.match(trust, /id: "staff_attested"/);
  assert.match(trust, /staff\.id === "screening_on_file" \|\| staff\.id === "staff_attested"/);
});

test("owner manages the team; staff only act on their own items", () => {
  assert.equal(
    decideScreeningAccess({ actorRole: "staff", actorUserId: "u1", targetUserId: "u1", action: "act_own" }).ok,
    true,
  );
  assert.equal(
    decideScreeningAccess({ actorRole: "staff", actorUserId: "u1", targetUserId: "u2", action: "act_own" }).ok,
    false,
  );
  assert.equal(
    decideScreeningAccess({ actorRole: "staff", actorUserId: "u1", action: "manage" }).ok,
    false,
  );
  assert.equal(
    decideScreeningAccess({ actorRole: "owner", actorUserId: "u1", action: "manage" }).ok,
    true,
  );
});

test("Admin reject requires a reason; approve only from the review queue", () => {
  assert.equal(decideAdminScreeningReview({ action: "reject", currentStatus: "admin_review" }).ok, false);
  assert.equal(
    decideAdminScreeningReview({ action: "reject", reason: "Expired", currentStatus: "admin_review" }).ok,
    true,
  );
  assert.equal(decideAdminScreeningReview({ action: "approve", currentStatus: "missing" }).ok, false);
  assert.equal(decideAdminScreeningReview({ action: "approve", currentStatus: "uploaded" }).next, "cleared");
});

test("cleared documents past expiry read as expired", () => {
  assert.equal(effectiveDocStatus({ status: "cleared", expiresOn: "2020-01-01" }), "expired");
  assert.equal(effectiveDocStatus({ status: "cleared", expiresOn: "2099-01-01" }), "cleared");
});

test("VSC letter is a police request and never claims KidEase issued the check", () => {
  const html = screeningLetterHtml({
    centreName: "Prairie Kids",
    personName: "Alex Rivera",
    role: "staff",
    province: "MB",
    generatedOn: "2026-09-13",
  });
  assert.match(html, /Prairie Kids/);
  assert.match(html, /cannot issue a Vulnerable Sector Check/i);
  assert.doesNotMatch(html.toLowerCase(), /background checked by kidease/);
  assert.doesNotMatch(html.toLowerCase(), /police-checked by kidease/);
});

test("upload parser accepts a small data URL and rejects junk", () => {
  const ok = parseScreeningUpload({
    dataUrl: `data:application/pdf;base64,${"QQ=="}`,
    mime: "application/pdf",
    filename: "vsc.pdf",
  });
  assert.equal(ok.ok, true);
  assert.equal(parseScreeningUpload({ dataUrl: "http://evil", mime: "application/pdf" }).ok, false);
  assert.equal(parseScreeningUpload({ dataUrl: "data:,x", mime: "text/plain" }).ok, false);
  const inferred = parseScreeningUpload({
    dataUrl: `data:application/pdf;base64,${"QQ=="}`,
    mime: "",
    filename: "criminal-record.pdf",
  });
  assert.equal(inferred.ok, true);
  assert.equal(inferred.ok && inferred.mime, "application/pdf");
  assert.equal(inferPrivateDocMime({ mime: "image/jpg", filename: "licence.JPG" }), "image/jpeg");
});

test("private screening and licence docs persist as R2 keys and reopen via auth routes", () => {
  assert.equal(allowPrivateDocType("application/pdf"), "application/pdf");
  assert.equal(allowPrivateDocType("image/jpg"), "image/jpeg");
  assert.throws(() => allowPrivateDocType("text/html"), /PDF or image/);
  assert.equal(isPrivateDocKey("screening/abc/vsc-1.pdf"), true);
  assert.equal(isPrivateDocKey("licenses/abc/lic_1.pdf"), true);
  assert.equal(isPrivateDocKey("originals/wpg/1001.jpg"), false);
  assert.equal(screeningDocHref("sd_1"), "/api/screening-documents/sd_1");
  assert.equal(licenseDocHref("ke-1"), "/api/license-docs/ke-1");
  assert.equal(licenseReviewMarker("data:image/jpeg;base64,aaaa"), "data:image");
  assert.equal(licenseReviewMarker("licenses/ke-1/lic_1.pdf"), "licenses/ke-1/lic_1.pdf");
  assert.match(src("src/lib/admin-verify.ts"), /hasStoredPrivateDoc/);
  assert.match(src("src/lib/admin-verify.ts"), /data:application\/pdf/);
  assert.match(src("src/lib/server/provider-screening.ts"), /persistPrivateDoc/);
  assert.match(src("src/lib/server/provider-screening.ts"), /R2_SCREENING_PREFIX/);
  assert.doesNotMatch(src("src/lib/server/provider-screening.ts"), /storageRef: file\.dataUrl/);
  assert.match(src("src/components/provider-screening.tsx"), /screeningDocHref/);
  assert.match(src("src/components/provider-screening.tsx"), /postPrivateDocForm/);
  assert.match(src("src/components/admin-screening.tsx"), /screeningDocHref/);
  assert.doesNotMatch(src("src/components/admin-screening.tsx"), /window\.open\(file\.dataUrl/);
  assert.match(src("src/components/provider-listing-forms.tsx"), /licenseDocHref/);
  assert.match(src("src/routes/admin.tsx"), /licenseDocHref/);
  assert.match(src("src/routes/api/screening-documents.ts"), /saveScreeningUpload/);
  assert.match(src("src/routes/api/screening-documents.\$id.ts"), /authorizeScreeningDocument/);
  assert.match(src("src/routes/api/license-docs.\$daycareId.ts"), /R2_LICENSE_PREFIX/);
  assert.match(src("src/routeTree.gen.ts"), /id:\s*'\/api\/screening-documents\/\$id'/);
  assert.match(src("src/routeTree.gen.ts"), /id:\s*'\/api\/license-docs\/\$daycareId'/);
  assert.match(src("src/lib/server/admin-centres.ts"), /licenseReviewMarker/);
  assert.match(src("src/lib/server/map-row.ts"), /licensePhotoOnFile/);
  assert.doesNotMatch(src("src/lib/server/catalog-neon.ts"), /license_photo/);
});

test("migration seeds MB thoroughly and stubs other provinces", () => {
  const sql = src("migrations/0046_provider_screening.sql");
  assert.match(sql, /provider_screening_requirements/);
  assert.match(sql, /provider_screening_people/);
  assert.match(sql, /provider_screening_documents/);
  assert.match(sql, /screening_on_file/);
  assert.match(sql, /listing_trust_events/i);
  assert.match(sql, /'MB', 'owner', 'vsc'/);
  assert.match(sql, /'MB', 'staff', 'child_abuse_registry'/);
  assert.match(sql, /'MB', 'home_resident', 'prior_contact'/);
  assert.match(sql, /'ON', 'owner', 'vsc'/);
  assert.match(sql, /'BC', 'staff', 'vsc'/);
  assert.doesNotMatch(sql, /background_checked|safety_grade|inspection_score/);
  assert.match(sql, /KidEase cannot run or stamp this check/);
});

test("public copy and desks stay honest and PIPEDA-tight", () => {
  const copy = src("src/lib/copy.ts");
  const trust = src("src/lib/trust.ts");
  assert.match(copy, /trustScreeningOnFile: "Screening on file"/);
  assert.match(copy, /trustScreeningOnFile: "Dossier de filtrage"/);
  assert.match(copy, /daycareRequirements: "Daycare requirements"/);
  assert.match(copy, /daycareRequirements: "Exigences pour les garderies"/);
  assert.doesNotMatch(copy, /Background checked by KidEase/);
  assert.doesNotMatch(copy, /KidEase background-checked/);
  assert.match(trust, /Never emit "Background checked by KidEase"/);
  assert.match(src("src/components/provider-screening.tsx"), /ProviderScreeningPanel/);
  assert.match(src("src/components/provider-screening.tsx"), /uploadDocHint/);
  assert.match(src("src/components/provider-screening.tsx"), /uploadDocTooBig/);
  assert.match(src("src/components/admin-screening.tsx"), /AdminScreeningQueue/);
  assert.match(src("src/routes/admin.tsx"), /tab === "screening"/);
  assert.match(src("src/routes/provider.tsx"), /desk === "screening"/);
  assert.match(src("src/lib/desk-nav.ts"), /id: "screening"/);
  assert.doesNotMatch(src("src/lib/desk-nav.ts"), /OWNER_ONLY_NAV = new Set\(\[[^\]]*screening/);
  assert.match(src("src/routes/verify.tsx"), /verifyScreeningTitle/);
  assert.match(src("src/routes/daycare-requirements.tsx"), /reqPoliceBody/);
  assert.match(src("src/components/trust-bar.tsx"), /daycare-requirements/);
  assert.doesNotMatch(src("src/lib/site-footer-nav.ts"), /delete-account/);
  assert.match(src("src/lib/server/provider-screening.ts"), /kind: "screening_upload"/);
  assert.match(src("src/lib/server/provider-screening.ts"), /screening_approve/);
  assert.match(src("src/lib/server/provider-screening.ts"), /screening_reject/);
  assert.match(src("src/lib/server/provider-screening.ts"), /storage_ref/);
  assert.match(src("src/lib/server/map-row.ts"), /screeningOnFile/);
});

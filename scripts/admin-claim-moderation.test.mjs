import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { mapAdminCentreSqlRow } from "../src/lib/admin-centres-map.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = readFileSync(join(root, "src/lib/server/admin-centres.ts"), "utf8");
const queue = readFileSync(join(root, "src/lib/server/admin-centre-queue.ts"), "utf8");
const queueQuery = queue.match(/rows = await sql<AdminCentreSqlRow>`([\s\S]*?)`;/)?.[1];

test("declined claims keep Approve and hide Waiting/Decline as live actions", () => {
  const ui = readFileSync(join(root, "src/components/admin-review-card.tsx"), "utf8");
  assert.match(ui, /disabled=\{locked \|\| status === "declined"\}/);
  assert.match(ui, /centre\.reviewNote/);
  assert.match(ui, /centre\.reviewedAt/);
  assert.ok(queueQuery, "the shared reader must execute the moderation queue query");
  assert.match(queueQuery, /c\.reviewed_at,\s+c\.review_note,/);
  assert.match(queueQuery, /select id, status, user_id, created_at, reviewed_at, review_note, license_photo\s+from listing_claims/);
  assert.doesNotMatch(queueQuery, /null::timestamptz as reviewed_at/);
  assert.doesNotMatch(queueQuery, /null(?:::text)? as review_note/);
});

test("admin queue shows licence and storefront photos for review", () => {
  const ui = (readFileSync(join(root, "src/routes/admin.tsx"), "utf8") + "\n" + readFileSync(join(root, "src/components/admin-desk-page.tsx"), "utf8"));
  const card = readFileSync(join(root, "src/components/admin-review-card.tsx"), "utf8");
  assert.match(card, /centre\.licensePhoto/);
  assert.match(card, /centre\.storefrontPhoto/);
  assert.match(ui, /Licence and photo review/);
  assert.match(ui, /needsVerification/);
  const nav = readFileSync(join(root, "src/lib/desk-nav.ts"), "utf8");
  assert.match(nav, /id: "verify"/);
  assert.match(queueQuery, /coalesce\(nullif\(btrim\(c\.license_photo\), ''\), nullif\(btrim\(d\.license_photo\), ''\)\) as license_photo/);
  assert.match(queueQuery, /\bd\.photos,/);
  assert.match(queue, /overlayStoredLicensePhotos\(sql, rows\),\s+readClaimFraudFlags\(sql,/);
  assert.match(queue, /const photos = firstReviewPhoto\(r\.photos, r\.license_photo\)/);
  assert.match(queue, /licensePhoto: licenseReviewMarker\(licensePhoto\)/);
  assert.match(queue, /storefrontPhoto: storefront \|\| null/);
  assert.match(queue, /return \{\s+\.\.\.row,\s+live,\s+\.\.\.photos,/);
});

test("persisted declined review details and both photos survive queue row mapping", () => {
  const reviewedAt = new Date("2026-11-18T12:30:00.000Z");
  const row = mapAdminCentreSqlRow({
    daycare_id: "synthetic-moderation-centre",
    slug: "synthetic-moderation-centre",
    name: "Synthetic Moderation Centre",
    address: "1 Synthetic Avenue",
    city: "Winnipeg",
    province: "MB",
    claim_status: "declined",
    claim_row_status: "declined",
    claim_id: "synthetic-declined-claim",
    claimed_at: null,
    submitted_at: "2026-11-17T12:30:00.000Z",
    reviewed_at: reviewedAt,
    review_note: "Synthetic review: updated licence needed.",
    license_photo: "licenses/synthetic-review.pdf",
    photos: "/img/synthetic-storefront.webp",
  });
  assert.equal(row.claimStatus, "declined");
  assert.equal(row.reviewedAt, reviewedAt.toISOString());
  assert.equal(row.reviewNote, "Synthetic review: updated licence needed.");
  assert.equal(row.licensePhoto, "licenses/synthetic-review.pdf");
  assert.equal(row.storefrontPhoto, "/img/synthetic-storefront.webp");
});

test("the public queue RPC authenticates and authorizes before invoking the internal reader", () => {
  const handler = server.slice(
    server.indexOf("export const listAdminCentres ="),
    server.indexOf("export function listIncompleteAdminCentres"),
  );
  assert.match(server, /import \{ readAdminCentreQueueRows \} from "@\/lib\/server\/admin-centre-queue"/);
  assert.match(handler, /createServerFn\(\{ method: "GET" \}\)/);
  assert.match(handler, /\.middleware\(\[authMiddleware\]\)/);
  const authorizeAt = handler.indexOf("await requireOperator(context.userId)");
  const readAt = handler.indexOf("await readAdminCentreQueueRows()");
  assert.ok(authorizeAt >= 0, "the queue handler must await operator authorization");
  assert.ok(readAt > authorizeAt, "authorization must finish before reading private claims");
  assert.match(server, /async function requireOperator\(userId: string\) \{\s+return requireAdmin\(userId\);\s+\}/);

  const roles = readFileSync(join(root, "src/lib/server/roles.ts"), "utf8");
  const gate = roles.match(/export async function requireAdmin\(userId: string\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(gate, "operator authorization must retain the complete admin gate");
  assert.match(gate, /const access = await resolveAdminAccess\(userId\);\s+if \(!access\.ok\) throw new Error\("Not authorized"\)/);
  assert.match(gate, /assertTwoFactorVerified\(userId\);\s+await assertTrustedDeviceActive\(userId\);\s+await assertAdminIdleFresh\(userId\)/);
});

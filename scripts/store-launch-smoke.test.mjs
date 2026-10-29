/**
 * Store-launch smoke: marketplace loop, claim anti-hijack, and IDOR / RBAC.
 * Pure decisions. No database and no secrets.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CLAIM_ALREADY_TAKEN,
  LISTING_NOT_FOUND,
  PROTECTED_OPERATOR_EMAILS,
  REVIEWER_DEMO_SLUG,
  canCallAdminApi,
  canCallDeskWriteApi,
  canReadBooking,
  canReadChild,
  canUpdateBookingStatus,
  claimTargetLocked,
  decideStartClaim,
  guestPathKind,
} from "../src/lib/access-control.ts";
import { advanceMarketplaceLoop, parentOpensMarketplaceLoop, providerMaySetBookingStatus } from "../src/lib/marketplace-loop.ts";
import { canAdvanceTour } from "../src/lib/tour-pipeline.ts";
import { canWithdrawWaitlist } from "../src/lib/waitlist-tracker.ts";
import { buildContentSecurityPolicy } from "./csp.mjs";
import { KLERNOUT45_USER, PROTECTED_OPERATOR_EMAILS as SEED_PROTECTED } from "./seed-reviewer-demo.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const PARENT = "parent-a";
const OTHER_PARENT = "parent-b";
const PROVIDER = "provider-a";
const OTHER_PROVIDER = "provider-b";
const CENTRE = "centre-a";
const OTHER_CENTRE = "centre-b";

test("parent to provider booking, tour, and waitlist loop", () => {
  let step = parentOpensMarketplaceLoop();
  assert.equal(step.booking, "requested");
  assert.equal(step.tour, "pending");
  assert.equal(step.waitlist, "sent");
  assert.equal(canWithdrawWaitlist(step.waitlist), true);

  const review = advanceMarketplaceLoop(step, "under_review");
  assert.equal(review.ok, true);
  step = review.state;
  assert.equal(step.booking, "under_review");
  assert.equal(step.waitlist, "seen");
  assert.equal(step.tour, "pending");

  const waiting = advanceMarketplaceLoop(step, "waitlist");
  assert.equal(waiting.ok, true);
  step = waiting.state;
  assert.equal(step.waitlist, "waitlisted");
  assert.equal(canWithdrawWaitlist("waitlisted"), true);

  const offered = advanceMarketplaceLoop(step, "accepted");
  assert.equal(offered.ok, true);
  step = offered.state;
  assert.equal(step.booking, "accepted");
  assert.equal(step.tour, "enrolled");
  assert.equal(step.waitlist, "offered");
  assert.equal(canAdvanceTour("pending", "enrolled"), false);
  assert.equal(canAdvanceTour("accepted", "completed"), true);

  const declined = advanceMarketplaceLoop(parentOpensMarketplaceLoop(), "declined");
  assert.equal(declined.state.tour, "lost");
  assert.equal(declined.state.waitlist, "declined");
  assert.equal(canWithdrawWaitlist("declined"), false);

  const illegal = advanceMarketplaceLoop(step, "active");
  assert.equal(illegal.ok, false);
  assert.equal(illegal.state.booking, "accepted");
  assert.equal(providerMaySetBookingStatus("accepted"), true);
  assert.equal(providerMaySetBookingStatus("requested"), false);

  assert.equal(
    canUpdateBookingStatus({ daycareId: CENTRE, ownedDaycareIds: [CENTRE], role: "provider" }),
    true,
  );
  assert.equal(
    canUpdateBookingStatus({ daycareId: CENTRE, ownedDaycareIds: [], role: "parent" }),
    false,
  );
  assert.equal(
    canUpdateBookingStatus({ daycareId: CENTRE, ownedDaycareIds: [OTHER_CENTRE], role: "provider" }),
    false,
  );
});

test("a second user cannot claim a taken, verified, demo, or protected centre", () => {
  assert.deepEqual(
    decideStartClaim({
      actorUserId: OTHER_PROVIDER,
      existingOwnerUserId: PROVIDER,
      listingFound: true,
      claimStatus: "approved",
      verified: true,
    }),
    { ok: false, error: CLAIM_ALREADY_TAKEN },
  );
  assert.deepEqual(
    decideStartClaim({
      actorUserId: OTHER_PROVIDER,
      listingFound: true,
      slug: REVIEWER_DEMO_SLUG,
      isAdmin: true,
      adminOnly: true,
    }),
    { ok: false, error: CLAIM_ALREADY_TAKEN },
  );
  assert.deepEqual(
    decideStartClaim({
      actorUserId: OTHER_PROVIDER,
      listingFound: true,
      slug: REVIEWER_DEMO_SLUG,
      adminOnly: true,
      isAdmin: false,
    }),
    { ok: false, error: LISTING_NOT_FOUND },
  );
  assert.equal(
    decideStartClaim({
      actorUserId: PROVIDER,
      existingOwnerUserId: PROVIDER,
      listingFound: true,
      slug: REVIEWER_DEMO_SLUG,
      isAdmin: true,
    }).ok,
    true,
  );
  assert.equal(claimTargetLocked({ verified: 1 }), true);
  assert.equal(claimTargetLocked({ claimStatus: "unclaimed" }), false);
  for (const email of PROTECTED_OPERATOR_EMAILS) {
    assert.equal(claimTargetLocked({ ownerEmail: email }), true);
    assert.equal(
      decideStartClaim({
        actorUserId: OTHER_PROVIDER,
        existingOwnerUserId: PROVIDER,
        ownerEmail: email,
        listingFound: true,
      }).ok,
      false,
    );
  }
  assert.deepEqual(SEED_PROTECTED, [...PROTECTED_OPERATOR_EMAILS]);
  assert.equal(KLERNOUT45_USER.email, "klernout45@gmail.com");
  const seed = src("scripts/seed-reviewer-demo.mjs");
  assert.doesNotMatch(seed, /test-ghost-claim-lab|qa-test-daycare-listing|kids-world-daycare-qjye/);
  assert.doesNotMatch(seed, /\$2[aby]\$/);
  assert.match(src("vercel.json"), /\/daycare\/qa-reviewer-demo-centre/);
  assert.match(src("vercel.json"), /\/book\/qa-reviewer-demo-centre/);
  assert.match(src("vercel.json"), /noindex, nofollow/);
});

test("guest, parent, provider, and admin stay on their own rows", () => {
  assert.equal(guestPathKind("/api/admin/users"), "admin_api");
  assert.equal(guestPathKind("/parent"), "sign_in");
  assert.equal(guestPathKind("/book/some-centre"), "sign_in");
  assert.equal(guestPathKind("/delete-account"), "public");
  assert.equal(guestPathKind("/search"), "public");

  assert.equal(canReadChild(PARENT, OTHER_PARENT), false);
  assert.equal(canReadChild(PARENT, PARENT), true);
  assert.equal(
    canReadBooking({
      actorUserId: OTHER_PARENT,
      bookingOwnerId: PARENT,
      daycareId: CENTRE,
      ownedDaycareIds: [],
      role: "parent",
    }),
    false,
  );
  assert.equal(
    canReadBooking({
      actorUserId: PROVIDER,
      bookingOwnerId: PARENT,
      daycareId: CENTRE,
      ownedDaycareIds: [CENTRE],
      role: "provider",
    }),
    true,
  );
  assert.equal(
    canReadBooking({
      actorUserId: OTHER_PROVIDER,
      bookingOwnerId: PARENT,
      daycareId: CENTRE,
      ownedDaycareIds: [OTHER_CENTRE],
      role: "provider",
    }),
    false,
  );
  assert.equal(canCallAdminApi("parent"), false);
  assert.equal(canCallAdminApi("provider"), false);
  assert.equal(canCallAdminApi("guest"), false);
  assert.equal(canCallAdminApi("admin"), true);
  assert.equal(
    canCallDeskWriteApi({
      actorRole: "parent",
      actorUserId: PARENT,
      target: "admin",
    }),
    false,
  );
  assert.equal(
    canCallDeskWriteApi({
      actorRole: "provider",
      actorUserId: PROVIDER,
      target: "parent_child",
      resourceOwnerId: PARENT,
    }),
    false,
  );
  assert.equal(
    canCallDeskWriteApi({
      actorRole: "admin",
      target: "admin",
    }),
    true,
  );
  assert.equal(
    canCallDeskWriteApi({
      actorRole: "provider",
      actorUserId: PROVIDER,
      target: "provider_listing",
      ownedDaycareIds: [OTHER_CENTRE],
      daycareId: CENTRE,
    }),
    false,
  );
});

test("store redirects, CSP, and search/login paint hooks", () => {
  const vercel = src("vercel.json");
  assert.match(vercel, /"source": "\/account\/delete"/);
  assert.match(vercel, /"destination": "\/delete-account"/);
  assert.match(vercel, /"source": "\/fr\/account\/delete"/);
  assert.match(vercel, /"destination": "\/fr\/delete-account"/);
  assert.match(src("src/routes/__root.tsx"), /\/account\/delete/);
  assert.match(src("src/routes/__root.tsx"), /statusCode: 301/);

  const csp = buildContentSecurityPolicy("noncevalue");
  assert.match(csp, /form-action 'self' https:\/\/accounts\.google\.com/);
  assert.match(csp, /connect-src[^;]*https:\/\/tiles\.openfreemap\.org/);
  assert.match(csp, /connect-src[^;]*https:\/\/tiles\.maps\.eox\.at/);
  assert.doesNotMatch(csp, /maps\.googleapis\.com/);
  assert.doesNotMatch(csp, /tile\.googleapis\.com/);
  assert.doesNotMatch(src("src/routes/__root.tsx"), /href: "https:\/\/maps\.googleapis\.com"/);

  assert.match(src("public/apple-app-site-association"), /GAUC28WJXZ\.ca\.kidease\.app/);
  assert.doesNotMatch(src("public/apple-app-site-association"), /XXXXXXXXXX/);
  assert.match(src("docs/store-readiness.md"), /APPLE_TEAM_ID/);
  assert.match(src("docs/store-readiness.md"), /VITE_APPLE_APP_STORE_ID/);
  assert.match(src("scripts/1password-env-inventory.mjs"), /APPLE_TEAM_ID/);
  assert.match(src("scripts/1password-env-inventory.mjs"), /VITE_APPLE_APP_STORE_ID/);

  const search = src("src/routes/search.tsx");
  assert.match(search, /eagerThumbs/);
  assert.doesNotMatch(search, /void import\("@\/components\/map-view"\)/);
  assert.match(src("src/routes/login.tsx"), /LoginEmailControl/);
  assert.match(src("src/routes/login.tsx"), /LoginPasswordControl/);
  assert.match(src("src/lib/listing-visibility.ts"), /coalesce\(is_demo, 0\) = 0/);
});

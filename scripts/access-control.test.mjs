import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  accessDeniedMessage,
  canCallAdminApi,
  canCallSupportApi,
  canCheckoutBill,
  canCreateBillForCentre,
  canCreatePaymentForBooking,
  canListProviderRequests,
  canReadBill,
  canReadBooking,
  canReadLead,
  canReadChild,
  canReadOwnProfile,
  canReadPayment,
  canUpdateBookingStatus,
  canUpdateLeadRequestStatus,
  canWriteChild,
  canWriteOwnProfile,
  canWritePayment,
  ownsDaycare,
  sameUser,
} from "../src/lib/access-control.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const PARENT_A = "user-parent-a";
const PARENT_B = "user-parent-b";
const DAYCARE = "user-daycare";
const OTHER_DAYCARE = "user-daycare-other";
const ADMIN = "user-admin";
const CENTRE_A = "dc-elm";
const CENTRE_B = "dc-oak";

test("parent and daycare sessions cannot call admin APIs; admin can", () => {
  assert.equal(canCallAdminApi("parent"), false);
  assert.equal(canCallAdminApi("provider"), false);
  assert.equal(canCallAdminApi("support"), false);
  assert.equal(canCallAdminApi("support_lead"), false);
  assert.equal(canCallAdminApi("admin"), true);
  assert.equal(canCallSupportApi("parent"), false);
  assert.equal(canCallSupportApi("provider"), false);
  assert.equal(canCallSupportApi("support"), true);
  assert.equal(canCallSupportApi("admin"), true);
});

test("parent A cannot read or write parent B payments, children, or profile", () => {
  assert.equal(canReadPayment(PARENT_A, PARENT_B), false);
  assert.equal(canWritePayment(PARENT_A, PARENT_B), false);
  assert.equal(canCreatePaymentForBooking(PARENT_A, PARENT_B), false);
  assert.equal(canReadChild(PARENT_A, PARENT_B), false);
  assert.equal(canWriteChild(PARENT_A, PARENT_B), false);
  assert.equal(canReadOwnProfile(PARENT_A, PARENT_B), false);
  assert.equal(canWriteOwnProfile(PARENT_A, PARENT_B), false);

  assert.equal(canReadPayment(PARENT_A, PARENT_A), true);
  assert.equal(canWritePayment(PARENT_A, PARENT_A), true);
  assert.equal(canCreatePaymentForBooking(PARENT_A, PARENT_A), true);
  assert.equal(canReadChild(PARENT_A, PARENT_A), true);
  assert.equal(canWriteChild(PARENT_A, PARENT_A), true);
  assert.equal(canReadOwnProfile(PARENT_A, PARENT_A), true);
});

test("daycare session cannot pay or edit another family's child or profile", () => {
  assert.equal(canCreatePaymentForBooking(DAYCARE, PARENT_A), false);
  assert.equal(canWritePayment(DAYCARE, PARENT_A), false);
  assert.equal(canWriteChild(DAYCARE, PARENT_A), false);
  assert.equal(canWriteOwnProfile(DAYCARE, PARENT_A), false);
});

test("booking read: owner parent, owning centre, or admin — never a stranger", () => {
  const owned = [CENTRE_A];
  assert.equal(
    canReadBooking({
      actorUserId: PARENT_A,
      bookingOwnerId: PARENT_A,
      daycareId: CENTRE_A,
      ownedDaycareIds: [],
    }),
    true,
  );
  assert.equal(
    canReadBooking({
      actorUserId: DAYCARE,
      bookingOwnerId: PARENT_A,
      daycareId: CENTRE_A,
      ownedDaycareIds: owned,
    }),
    true,
  );
  assert.equal(
    canReadBooking({
      actorUserId: OTHER_DAYCARE,
      bookingOwnerId: PARENT_A,
      daycareId: CENTRE_A,
      ownedDaycareIds: [CENTRE_B],
    }),
    false,
  );
  assert.equal(
    canReadBooking({
      actorUserId: PARENT_B,
      bookingOwnerId: PARENT_A,
      daycareId: CENTRE_A,
      ownedDaycareIds: [],
    }),
    false,
  );
  assert.equal(
    canReadBooking({
      actorUserId: ADMIN,
      bookingOwnerId: PARENT_A,
      daycareId: CENTRE_A,
      ownedDaycareIds: [],
      role: "admin",
    }),
    true,
  );
});

test("parent cannot accept their own request; other centres cannot either", () => {
  assert.equal(canUpdateBookingStatus({ daycareId: CENTRE_A, ownedDaycareIds: [] }), false);
  assert.equal(
    canUpdateBookingStatus({ daycareId: CENTRE_A, ownedDaycareIds: [], role: "parent" }),
    false,
  );
  assert.equal(
    canUpdateBookingStatus({ daycareId: CENTRE_A, ownedDaycareIds: [CENTRE_B], role: "provider" }),
    false,
  );
  assert.equal(
    canUpdateBookingStatus({ daycareId: CENTRE_A, ownedDaycareIds: [CENTRE_A], role: "provider" }),
    true,
  );
  assert.equal(canUpdateBookingStatus({ daycareId: CENTRE_A, ownedDaycareIds: [], role: "admin" }), true);
});

test("lead read: owner parent, owning centre, or admin — never a stranger", () => {
  assert.equal(
    canReadLead({
      actorUserId: PARENT_A,
      parentUserId: PARENT_A,
      daycareId: CENTRE_A,
      ownedDaycareIds: [],
    }),
    true,
  );
  assert.equal(
    canReadLead({
      actorUserId: DAYCARE,
      parentUserId: PARENT_A,
      daycareId: CENTRE_A,
      ownedDaycareIds: [CENTRE_A],
    }),
    true,
  );
  assert.equal(
    canReadLead({
      actorUserId: PARENT_B,
      parentUserId: PARENT_A,
      daycareId: CENTRE_A,
      ownedDaycareIds: [],
    }),
    false,
  );
  assert.equal(
    canReadLead({
      actorUserId: OTHER_DAYCARE,
      parentUserId: PARENT_A,
      daycareId: CENTRE_A,
      ownedDaycareIds: [CENTRE_B],
    }),
    false,
  );
  assert.equal(
    canReadLead({
      actorUserId: ADMIN,
      parentUserId: PARENT_A,
      daycareId: CENTRE_A,
      ownedDaycareIds: [],
      role: "admin",
    }),
    true,
  );
});

test("parent cannot confirm their own lead; other centres cannot either", () => {
  assert.equal(canUpdateLeadRequestStatus({ daycareId: CENTRE_A, ownedDaycareIds: [] }), false);
  assert.equal(
    canUpdateLeadRequestStatus({ daycareId: CENTRE_A, ownedDaycareIds: [], role: "parent" }),
    false,
  );
  assert.equal(
    canUpdateLeadRequestStatus({ daycareId: CENTRE_A, ownedDaycareIds: [CENTRE_B], role: "provider" }),
    false,
  );
  assert.equal(
    canUpdateLeadRequestStatus({ daycareId: CENTRE_A, ownedDaycareIds: [CENTRE_A], role: "provider" }),
    true,
  );
  assert.equal(canUpdateLeadRequestStatus({ daycareId: CENTRE_A, ownedDaycareIds: [], role: "admin" }), true);
});

test("provider request list is empty when the session owns no centre", () => {
  assert.equal(canListProviderRequests(false), false);
  assert.equal(canListProviderRequests(true), true);
});

test("bills: parent B cannot see or checkout parent A; drafts stay hidden", () => {
  const sent = canReadBill({
    actorUserId: PARENT_A,
    parentUserId: PARENT_A,
    daycareId: CENTRE_A,
    ownedDaycareIds: [],
    status: "sent",
  });
  assert.equal(sent.ok, true);
  assert.equal(sent.role, "parent");

  const draft = canReadBill({
    actorUserId: PARENT_A,
    parentUserId: PARENT_A,
    daycareId: CENTRE_A,
    ownedDaycareIds: [],
    status: "draft",
  });
  assert.equal(draft.ok, false);

  const stranger = canReadBill({
    actorUserId: PARENT_B,
    parentUserId: PARENT_A,
    daycareId: CENTRE_A,
    ownedDaycareIds: [],
    status: "sent",
  });
  assert.equal(stranger.ok, false);

  const provider = canReadBill({
    actorUserId: DAYCARE,
    parentUserId: PARENT_A,
    daycareId: CENTRE_A,
    ownedDaycareIds: [CENTRE_A],
    status: "draft",
  });
  assert.equal(provider.ok, true);
  assert.equal(provider.role, "provider");

  assert.equal(
    canCheckoutBill({ actorUserId: PARENT_A, parentUserId: PARENT_A, status: "sent" }),
    true,
  );
  assert.equal(
    canCheckoutBill({ actorUserId: PARENT_B, parentUserId: PARENT_A, status: "sent" }),
    false,
  );
  assert.equal(
    canCheckoutBill({ actorUserId: DAYCARE, parentUserId: PARENT_A, status: "sent" }),
    false,
  );
  assert.equal(
    canCheckoutBill({ actorUserId: PARENT_A, parentUserId: PARENT_A, status: "draft" }),
    false,
  );
  assert.equal(canCreateBillForCentre([CENTRE_A], CENTRE_A), true);
  assert.equal(canCreateBillForCentre([CENTRE_B], CENTRE_A), false);
  assert.equal(canCreateBillForCentre([], CENTRE_A), false);
});

test("blank ids never match (IDOR probe with empty owner)", () => {
  assert.equal(sameUser("", ""), false);
  assert.equal(sameUser(PARENT_A, ""), false);
  assert.equal(ownsDaycare([], CENTRE_A), false);
  assert.equal(ownsDaycare([CENTRE_A], ""), false);
  assert.equal(accessDeniedMessage("payment"), "Payment not found");
  assert.equal(accessDeniedMessage("child"), "Child not found");
  assert.equal(accessDeniedMessage("request"), "Request not found");
});

test("family pay and child writes stay scoped to the session user id", () => {
  const family = src("src/lib/server/family.ts");
  assert.match(family, /canUpdateBookingStatus/);
  assert.match(family, /isCentreOwner\(sql, context\.userId, b\.daycare_id\)/);
  assert.match(family, /where id = \$\{data\.bookingId\} and user_id = \$\{context\.userId\}/);
  assert.match(family, /where id = \$\{paymentId\} and user_id = \$\{context\.userId\}/);
  assert.match(family, /where id = \$\{data\.id\} and user_id = \$\{context\.userId\}/);
  assert.match(family, /from children where user_id = \$\{context\.userId\}/);
  assert.match(family, /from payments p join daycares d on d\.id = p\.daycare_id/);
  assert.match(family, /where p\.user_id = \$\{context\.userId\}/);
  assert.doesNotMatch(
    family,
    /or not exists \(select 1 from provider_daycares p where p\.user_id = \$\{context\.userId\}\)/,
  );
});

test("admin HTTP routes keep requireAdmin; parent desk never imports listAdminMoney", () => {
  for (const rel of [
    "src/routes/api/admin.sentry-test.ts",
    "src/routes/api/admin.media.ts",
    "src/routes/api/admin.stripe-catalog.ts",
    "src/routes/api/admin.push-dry-run.ts",
  ]) {
    const body = src(rel);
    assert.match(body, /requireAdmin/, rel);
    assert.match(body, /assertSameSiteRequest/, rel);
  }
  assert.match(src("src/lib/server/admin-money.ts"), /requireAdmin/);
  assert.match(src("src/lib/server/admin-centres.ts"), /requireAdmin/);
  assert.doesNotMatch(src("src/components/parent-desk.tsx"), /listAdminMoney|listAdminContracts/);
  assert.doesNotMatch(src("src/routes/provider.tsx"), /listAdminMoney/);
});

test("billing getBill / checkout use canReadBill and decideBillCheckout", () => {
  const billing = src("src/lib/server/billing.ts");
  assert.match(billing, /canReadBill/);
  assert.match(billing, /decideBillCheckout/);
  assert.match(billing, /canCreateBillForCentre/);
  assert.match(billing, /parent_user_id = \$1/);
  assert.match(billing, /p\.user_id = \$1 and p\.daycare_id = i\.daycare_id/);
});

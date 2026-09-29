import assert from "node:assert/strict";
import { test } from "node:test";
import {
  destinationAfterSignIn,
  guardPrivatePath,
  homeForRole,
  listingActionMode,
  navRoleForSession,
  privateReturnPath,
  roleFlipAllowed,
  roleNavItems,
  upgradeNavLabel,
} from "../src/lib/role-access.ts";

test("public browse stays open and private URLs follow the role", () => {
  assert.equal(guardPrivatePath({ pathname: "/search", signedIn: false }).kind, "allow");
  assert.equal(guardPrivatePath({ pathname: "/daycare/city/winnipeg", signedIn: false }).kind, "allow");
  assert.equal(guardPrivatePath({ pathname: "/daycare/little-fox", signedIn: false }).kind, "allow");
  assert.equal(guardPrivatePath({ pathname: "/parent", signedIn: false }).kind, "signin");
  assert.equal(guardPrivatePath({ pathname: "/provider/subscription", signedIn: false }).kind, "signin");
  assert.equal(guardPrivatePath({ pathname: "/admin", signedIn: false }).kind, "not_found");
  assert.equal(guardPrivatePath({ pathname: "/admin", signedIn: true, role: "parent" }).kind, "not_found");
  assert.equal(guardPrivatePath({ pathname: "/admin", signedIn: true, role: "provider" }).kind, "not_found");
  assert.equal(guardPrivatePath({ pathname: "/admin", signedIn: true, role: "admin" }).kind, "allow");
  assert.deepEqual(guardPrivatePath({ pathname: "/provider", signedIn: true, role: "parent" }), {
    kind: "home",
    to: "/parent",
  });
  assert.deepEqual(guardPrivatePath({ pathname: "/parent", signedIn: true, role: "provider" }), {
    kind: "home",
    to: "/provider",
  });
  assert.equal(guardPrivatePath({ pathname: "/inbox", signedIn: true, role: "parent" }).kind, "allow");
  assert.equal(guardPrivatePath({ pathname: "/account", signedIn: true, role: "provider" }).kind, "allow");
  assert.deepEqual(guardPrivatePath({ pathname: "/parent?tab=payments", signedIn: false }), {
    kind: "signin",
    next: "/parent?tab=payments",
  });
  assert.equal(guardPrivatePath({ pathname: "/parent", signedIn: true, degraded: true }).kind, "allow");
  assert.equal(guardPrivatePath({ pathname: "/provider", signedIn: false, degraded: true }).kind, "allow");
  assert.equal(guardPrivatePath({ pathname: "/admin", signedIn: true, degraded: true }).kind, "not_found");
  assert.equal(privateReturnPath({ pathname: "/parent", href: "/parent?tab=payments" }), "/parent?tab=payments");
  assert.equal(navRoleForSession({ role: "parent", ownsCentre: true }), "provider");
  assert.equal(navRoleForSession({ role: "parent", activeMember: true }), "provider");
  assert.equal(navRoleForSession({ role: "parent" }), "parent");
  assert.equal(navRoleForSession({ role: "provider" }), "provider");
});

test("sign-in lands on the stored role home unless the next path is allowed", () => {
  assert.equal(destinationAfterSignIn({ role: "parent" }), "/parent");
  assert.equal(destinationAfterSignIn({ role: "provider" }), "/provider");
  assert.equal(destinationAfterSignIn({ role: "admin" }), "/admin");
  assert.equal(destinationAfterSignIn({ role: "parent", next: "/search" }), "/search");
  assert.equal(destinationAfterSignIn({ role: "parent", next: "/provider" }), "/parent");
  assert.equal(destinationAfterSignIn({ role: "provider", next: "/parent?tab=saved" }), "/provider");
  assert.equal(homeForRole("support"), "/support");
});

test("menus stay on one role and the plan label switches when paid", () => {
  assert.equal(upgradeNavLabel(false), "Upgrade");
  assert.equal(upgradeNavLabel(true), "My plan");
  const parent = roleNavItems({ role: "parent", paid: false }).map((item) => item.label);
  const daycare = roleNavItems({ role: "provider", paid: true }).map((item) => item.label);
  const guest = roleNavItems({ role: "guest" }).map((item) => item.label);
  assert.ok(parent.includes("Saved"));
  assert.ok(parent.includes("Upgrade"));
  assert.equal(parent.includes("My listing"), false);
  assert.ok(daycare.includes("Desk"));
  assert.ok(daycare.includes("My plan"));
  assert.equal(daycare.includes("Saved"), false);
  assert.ok(guest.includes("I'm a parent"));
  assert.ok(guest.includes("I'm a daycare"));
  assert.ok(guest.includes("Plans"));
  assert.equal(roleNavItems({ role: "guest" }).find((item) => item.id === "plans")?.to, "/plans");
  assert.equal(guest.includes("Admin"), false);
  assert.equal(roleNavItems({ role: "admin" }).some((item) => item.label === "Admin"), false);
});

test("listing actions follow the viewer, and a role sticks after sign-up", () => {
  assert.equal(listingActionMode({ role: "guest", ownsListing: false }), "parent");
  assert.equal(listingActionMode({ role: "parent", ownsListing: false }), "parent");
  assert.equal(listingActionMode({ role: "provider", ownsListing: false }), "parent");
  assert.equal(listingActionMode({ role: "provider", ownsListing: true }), "edit");
  assert.equal(listingActionMode({ role: "admin", ownsListing: false }), "all");
  assert.equal(roleFlipAllowed("parent", "provider", 60_000), true);
  assert.equal(roleFlipAllowed("parent", "provider", 31 * 60 * 1000), false);
  assert.equal(roleFlipAllowed("admin", "parent", 0), false);
});
